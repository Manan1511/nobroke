-- Keep net payment reporting as the default, with a separate endpoint for
-- users who deliberately report payment against one specific open debt.
CREATE FUNCTION private.report_payment_core(
  p_obligation_id uuid,
  p_amount numeric,
  p_request_id uuid,
  p_enforce_net_limit boolean
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  debt app.obligations%ROWTYPE;
  payment uuid;
  old_payment app.payment_reports%ROWTYPE;
  peer_net numeric(12,2);
  pending_outgoing numeric(12,2);
  available_net numeric(12,2);
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> pg_catalog.round(p_amount, 2)
     OR p_amount > 9999999999.99 OR p_request_id IS NULL OR p_enforce_net_limit IS NULL THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO debt FROM app.obligations WHERE obligation_id = p_obligation_id FOR UPDATE;
  IF NOT FOUND OR debt.debtor_user_id <> caller_id THEN
    RAISE EXCEPTION 'debtor_required' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO old_payment FROM app.payment_reports WHERE debtor_user_id = caller_id AND request_id = p_request_id;
  IF FOUND THEN
    IF old_payment.obligation_id IS DISTINCT FROM p_obligation_id
       OR old_payment.amount IS DISTINCT FROM p_amount
       OR old_payment.task_id IS NOT NULL THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
    END IF;
    RETURN old_payment.payment_id;
  END IF;
  IF debt.status NOT IN ('OPEN', 'PARTIAL') THEN
    RAISE EXCEPTION 'debtor_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount > debt.remaining_amount - private.obligation_reserved_amount(p_obligation_id) THEN
    RAISE EXCEPTION 'payment_exceeds_unreserved_debt' USING ERRCODE = 'P0001';
  END IF;

  IF p_enforce_net_limit THEN
    SELECT COALESCE(pg_catalog.sum(CASE
        WHEN o.debtor_user_id = caller_id THEN o.remaining_amount
        ELSE -o.remaining_amount
      END), 0)::numeric(12,2)
      INTO peer_net
    FROM app.obligations o
    WHERE ((o.debtor_user_id = caller_id AND o.creditor_user_id = debt.creditor_user_id)
        OR (o.debtor_user_id = debt.creditor_user_id AND o.creditor_user_id = caller_id))
      AND o.status IN ('OPEN', 'PARTIAL');

    SELECT COALESCE(pg_catalog.sum(r.amount), 0)::numeric(12,2)
      INTO pending_outgoing
    FROM app.payment_reports r
    WHERE r.debtor_user_id = caller_id
      AND r.creditor_user_id = debt.creditor_user_id
      AND r.status = 'PENDING';

    available_net := GREATEST(peer_net - pending_outgoing, 0);
    IF p_amount > available_net THEN
      RAISE EXCEPTION 'payment_exceeds_net_peer_balance' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO app.payment_reports(obligation_id, debtor_user_id, creditor_user_id, request_id, amount, status)
  VALUES (p_obligation_id, caller_id, debt.creditor_user_id, p_request_id, p_amount::numeric(12,2), 'PENDING')
  RETURNING payment_id INTO payment;
  INSERT INTO app.obligation_events(obligation_id, event_type, actor_user_id, amount, related_id)
  VALUES (p_obligation_id, 'PAYMENT_REPORTED', caller_id, p_amount::numeric(12,2), payment);
  RETURN payment;
END
$function$;
ALTER FUNCTION private.report_payment_core(uuid, numeric, uuid, boolean) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.report_payment_core(uuid, numeric, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.report_payment_core(uuid, numeric, uuid, boolean) TO nobroke_executor;

CREATE OR REPLACE FUNCTION private.report_payment(p_obligation_id uuid, p_amount numeric, p_request_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, private
AS $function$
  SELECT private.report_payment_core(p_obligation_id, p_amount, p_request_id, true)
$function$;
ALTER FUNCTION private.report_payment(uuid, numeric, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.report_payment(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.report_payment(uuid, numeric, uuid) TO authenticated;

CREATE FUNCTION private.report_individual_payment(p_obligation_id uuid, p_amount numeric, p_request_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, private
AS $function$
  SELECT private.report_payment_core(p_obligation_id, p_amount, p_request_id, false)
$function$;
ALTER FUNCTION private.report_individual_payment(uuid, numeric, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.report_individual_payment(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.report_individual_payment(uuid, numeric, uuid) TO authenticated;

CREATE FUNCTION api.report_individual_payment(p_obligation_id uuid, p_amount numeric, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE payment uuid;
BEGIN
  PERFORM private.lock_financial_writes();
  payment := private.report_individual_payment(p_obligation_id, p_amount, p_request_id);
  RETURN pg_catalog.jsonb_build_object('payment_id', payment, 'status', 'PENDING');
END
$function$;
ALTER FUNCTION api.report_individual_payment(uuid, numeric, uuid) SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION api.report_individual_payment(uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.report_individual_payment(uuid, numeric, uuid) TO authenticated;

-- These narrowly scoped read policies let both counterparties receive Realtime
-- invalidations. Financial data remains outside the PostgREST exposed schemas.
GRANT SELECT ON app.obligations, app.payment_reports TO authenticated;
CREATE POLICY obligations_participant_realtime_read ON app.obligations
  FOR SELECT TO authenticated
  USING (debtor_user_id = (SELECT auth.uid()) OR creditor_user_id = (SELECT auth.uid()));
CREATE POLICY payment_reports_participant_realtime_read ON app.payment_reports
  FOR SELECT TO authenticated
  USING (debtor_user_id = (SELECT auth.uid()) OR creditor_user_id = (SELECT auth.uid()));

DO $publication$
DECLARE table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY['obligations', 'payment_reports'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'app' AND tablename = table_name
      ) THEN
        EXECUTE pg_catalog.format('ALTER PUBLICATION supabase_realtime ADD TABLE app.%I', table_name);
      END IF;
    END LOOP;
  END IF;
END
$publication$;
