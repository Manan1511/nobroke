-- Bind payment request IDs to both the ledger operation and its task identity.
CREATE OR REPLACE FUNCTION private.report_payment(p_obligation_id uuid, p_amount numeric, p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); debt app.obligations%ROWTYPE; payment uuid; old_payment app.payment_reports%ROWTYPE;
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

CREATE OR REPLACE FUNCTION private.report_task_payment(p_task_id uuid, p_amount numeric, p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); task_row app.forwarding_tasks%ROWTYPE;
  debt app.obligations%ROWTYPE; previous app.payment_reports%ROWTYPE; payment uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> pg_catalog.round(p_amount, 2)
     OR p_amount > 9999999999.99 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO task_row FROM app.forwarding_tasks WHERE task_id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'forwarding_task_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO debt FROM app.obligations WHERE obligation_id = task_row.target_obligation_id FOR UPDATE;
  SELECT * INTO task_row FROM app.forwarding_tasks WHERE task_id = p_task_id FOR UPDATE;
  IF debt.debtor_user_id <> caller_id THEN RAISE EXCEPTION 'debtor_required' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO previous FROM app.payment_reports WHERE debtor_user_id = caller_id AND request_id = p_request_id;
  IF FOUND THEN
    IF previous.task_id IS DISTINCT FROM p_task_id
       OR previous.obligation_id IS DISTINCT FROM debt.obligation_id
       OR previous.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
    END IF;
    RETURN previous.payment_id;
  END IF;
  IF task_row.status <> 'PENDING' THEN RAISE EXCEPTION 'forwarding_task_unavailable' USING ERRCODE = 'P0001'; END IF;
  IF p_amount > task_row.remaining_amount THEN RAISE EXCEPTION 'payment_exceeds_task' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO app.payment_reports(obligation_id, debtor_user_id, creditor_user_id, request_id,
    amount, status, task_id)
  VALUES (debt.obligation_id, caller_id, debt.creditor_user_id, p_request_id,
    p_amount::numeric(12,2), 'PENDING', p_task_id) RETURNING payment_id INTO payment;
  UPDATE app.forwarding_tasks SET remaining_amount = remaining_amount - p_amount,
    status = CASE WHEN remaining_amount - p_amount = 0 THEN 'REPORTED' ELSE 'PENDING' END,
    updated_at = pg_catalog.clock_timestamp() WHERE task_id = p_task_id;
  INSERT INTO app.obligation_events(obligation_id, event_type, actor_user_id, amount, related_id)
  VALUES (debt.obligation_id, 'PAYMENT_REPORTED', caller_id, p_amount::numeric(12,2), payment);
  INSERT INTO app.forwarding_task_events(task_id, event_type, actor_user_id, amount, payment_id)
  VALUES (p_task_id, 'PAYMENT_REPORTED', caller_id, p_amount::numeric(12,2), payment);
  RETURN payment;
END
$function$;
ALTER FUNCTION private.report_task_payment(uuid, numeric, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.report_task_payment(uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.report_task_payment(uuid, numeric, uuid) TO authenticated;
