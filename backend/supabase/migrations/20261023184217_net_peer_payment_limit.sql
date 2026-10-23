CREATE OR REPLACE FUNCTION private.get_dashboard_balances()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'user_id', peer.user_id, 'username', peer.username, 'display_name', peer.display_name,
    'net_amount', peer.net_amount::numeric(12,2)::text,
    'available_to_pay', GREATEST(-peer.net_amount - peer.pending_outgoing, 0)::numeric(12,2)::text
  ) ORDER BY peer.net_amount DESC, peer.user_id), '[]'::jsonb)
  FROM (
    SELECT p.user_id, p.username, p.display_name,
      pg_catalog.sum(CASE WHEN o.creditor_user_id = auth.uid() THEN o.remaining_amount ELSE -o.remaining_amount END) AS net_amount,
      COALESCE((
        SELECT pg_catalog.sum(r.amount)
        FROM app.payment_reports r
        WHERE r.debtor_user_id = auth.uid()
          AND r.creditor_user_id = p.user_id
          AND r.status = 'PENDING'
      ), 0) AS pending_outgoing
    FROM app.obligations o
    JOIN app.profiles p ON p.user_id = CASE WHEN o.debtor_user_id = auth.uid() THEN o.creditor_user_id ELSE o.debtor_user_id END
    WHERE auth.uid() IN (o.debtor_user_id, o.creditor_user_id) AND o.status IN ('OPEN', 'PARTIAL')
    GROUP BY p.user_id, p.username, p.display_name
  ) AS peer
$function$;
ALTER FUNCTION private.get_dashboard_balances() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.get_dashboard_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_dashboard_balances() TO authenticated;

CREATE OR REPLACE FUNCTION private.report_payment(p_obligation_id uuid, p_amount numeric, p_request_id uuid)
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
     OR p_amount > 9999999999.99 OR p_request_id IS NULL THEN
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

  INSERT INTO app.payment_reports(obligation_id, debtor_user_id, creditor_user_id, request_id, amount, status)
  VALUES (p_obligation_id, caller_id, debt.creditor_user_id, p_request_id, p_amount::numeric(12,2), 'PENDING')
  RETURNING payment_id INTO payment;
  INSERT INTO app.obligation_events(obligation_id, event_type, actor_user_id, amount, related_id)
  VALUES (p_obligation_id, 'PAYMENT_REPORTED', caller_id, p_amount::numeric(12,2), payment);
  RETURN payment;
END
$function$;
ALTER FUNCTION private.report_payment(uuid, numeric, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.report_payment(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.report_payment(uuid, numeric, uuid) TO authenticated;
