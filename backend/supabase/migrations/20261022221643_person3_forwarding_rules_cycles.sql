-- Pay-when-paid rules reserve payable debt as tasks. Cash-settlement records are
-- created only after a creditor confirms an external payment report.

CREATE TABLE app.pay_when_paid_rules (
  rule_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  trigger_obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  target_obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  max_budget numeric(12,2) NOT NULL CHECK (max_budget > 0),
  remaining_budget numeric(12,2) NOT NULL CHECK (remaining_budget >= 0 AND remaining_budget <= max_budget),
  status text NOT NULL CHECK (status IN ('ARMED', 'CANCELLED', 'EXHAUSTED')),
  request_id uuid NOT NULL,
  request_hash bytea NOT NULL,
  version_no bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  cancelled_at timestamptz,
  CHECK (trigger_obligation_id <> target_obligation_id),
  UNIQUE (created_by, request_id)
);
CREATE INDEX pay_rules_trigger ON app.pay_when_paid_rules(trigger_obligation_id, status, rule_id);
CREATE INDEX pay_rules_target ON app.pay_when_paid_rules(target_obligation_id, status, rule_id);

CREATE TABLE app.forwarding_tasks (
  task_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES app.pay_when_paid_rules(rule_id) ON DELETE RESTRICT,
  trigger_payment_id uuid NOT NULL REFERENCES app.payment_reports(payment_id) ON DELETE RESTRICT,
  target_obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  remaining_amount numeric(12,2) NOT NULL CHECK (remaining_amount >= 0 AND remaining_amount <= amount),
  status text NOT NULL CHECK (status IN ('PENDING', 'REPORTED', 'CONFIRMED', 'CANCELLED')),
  cancel_after_resolution boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (rule_id, trigger_payment_id)
);
CREATE INDEX forwarding_tasks_target_pending ON app.forwarding_tasks(target_obligation_id, task_id)
  WHERE status = 'PENDING';
CREATE INDEX forwarding_tasks_rule ON app.forwarding_tasks(rule_id, created_at DESC);

ALTER TABLE app.payment_reports ADD COLUMN task_id uuid REFERENCES app.forwarding_tasks(task_id) ON DELETE RESTRICT;
CREATE INDEX payment_reports_task ON app.payment_reports(task_id, status) WHERE task_id IS NOT NULL;

CREATE TABLE app.forwarding_task_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES app.forwarding_tasks(task_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('CREATED', 'PAYMENT_REPORTED', 'PAYMENT_CONFIRMED',
    'PAYMENT_REJECTED', 'PAYMENT_CANCELLED', 'TASK_CANCELLED')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_id uuid REFERENCES app.payment_reports(payment_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX forwarding_task_events_timeline ON app.forwarding_task_events(task_id, event_id);

CREATE TABLE app.cycle_net_batches (
  cycle_net_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  rule_ids uuid[] NOT NULL,
  obligation_ids uuid[] NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE app.settlement_records ADD COLUMN cycle_net_id uuid REFERENCES app.cycle_net_batches(cycle_net_id) ON DELETE RESTRICT;

ALTER TABLE app.pay_when_paid_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.forwarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.forwarding_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cycle_net_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY pay_when_paid_rules_executor ON app.pay_when_paid_rules TO nobroke_executor USING (true) WITH CHECK (true);
CREATE POLICY forwarding_tasks_executor ON app.forwarding_tasks TO nobroke_executor USING (true) WITH CHECK (true);
CREATE POLICY forwarding_task_events_executor ON app.forwarding_task_events TO nobroke_executor USING (true) WITH CHECK (true);
CREATE POLICY cycle_net_batches_executor ON app.cycle_net_batches TO nobroke_executor USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON app.pay_when_paid_rules, app.forwarding_tasks TO nobroke_executor;
GRANT SELECT, INSERT ON app.forwarding_task_events, app.cycle_net_batches TO nobroke_executor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO nobroke_executor;

CREATE OR REPLACE FUNCTION private.obligation_reserved_amount(p_obligation_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT (COALESCE((SELECT pg_catalog.sum(p.amount) FROM app.payment_reports p
    WHERE p.obligation_id = p_obligation_id AND p.status = 'PENDING'), 0)
    + COALESCE((SELECT pg_catalog.sum(t.remaining_amount) FROM app.forwarding_tasks t
      WHERE t.target_obligation_id = p_obligation_id AND t.status = 'PENDING'), 0))::numeric(12,2)
$$;
ALTER FUNCTION private.obligation_reserved_amount(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.obligation_reserved_amount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.obligation_reserved_amount(uuid) TO nobroke_executor;

CREATE FUNCTION private.rule_request_hash(p_trigger uuid, p_target uuid, p_budget numeric)
RETURNS bytea LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, extensions
AS $$
  SELECT extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('trigger', p_trigger, 'target', p_target,
      'budget', p_budget::numeric(12,2)::text)::text, 'UTF8'), 'sha256')
$$;
ALTER FUNCTION private.rule_request_hash(uuid, uuid, numeric) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.rule_request_hash(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.rule_request_hash(uuid, uuid, numeric) TO nobroke_executor;

CREATE FUNCTION private.create_pay_when_paid_rule(
  p_trigger_obligation_id uuid, p_target_obligation_id uuid, p_max_amount numeric, p_request_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); trigger_row app.obligations%ROWTYPE; target_row app.obligations%ROWTYPE;
  request_hash bytea; previous app.pay_when_paid_rules%ROWTYPE; new_rule uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_max_amount IS NULL OR p_max_amount <= 0 OR p_max_amount <> pg_catalog.round(p_max_amount, 2)
     OR p_max_amount > 9999999999.99 OR p_request_id IS NULL
     OR p_trigger_obligation_id = p_target_obligation_id THEN
    RAISE EXCEPTION 'invalid_rule' USING ERRCODE = 'P0001';
  END IF;
  request_hash := private.rule_request_hash(p_trigger_obligation_id, p_target_obligation_id, p_max_amount);
  SELECT * INTO previous FROM app.pay_when_paid_rules
  WHERE created_by = caller_id AND request_id = p_request_id;
  IF FOUND THEN
    IF previous.request_hash <> request_hash THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001'; END IF;
    RETURN previous.rule_id;
  END IF;
  PERFORM 1 FROM app.obligations WHERE obligation_id IN (p_trigger_obligation_id, p_target_obligation_id)
    ORDER BY obligation_id FOR UPDATE;
  SELECT * INTO trigger_row FROM app.obligations WHERE obligation_id = p_trigger_obligation_id;
  SELECT * INTO target_row FROM app.obligations WHERE obligation_id = p_target_obligation_id;
  IF trigger_row.obligation_id IS NULL OR target_row.obligation_id IS NULL
     OR trigger_row.creditor_user_id <> caller_id OR target_row.debtor_user_id <> caller_id THEN
    RAISE EXCEPTION 'rule_party_relationship_required' USING ERRCODE = 'P0001';
  END IF;
  IF trigger_row.status NOT IN ('OPEN', 'PARTIAL') OR target_row.status NOT IN ('OPEN', 'PARTIAL') THEN
    RAISE EXCEPTION 'rule_obligations_must_be_open' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO app.pay_when_paid_rules(created_by, trigger_obligation_id, target_obligation_id,
    max_budget, remaining_budget, status, request_id, request_hash)
  VALUES (caller_id, p_trigger_obligation_id, p_target_obligation_id,
    p_max_amount::numeric(12,2), p_max_amount::numeric(12,2), 'ARMED', p_request_id, request_hash)
  RETURNING rule_id INTO new_rule;
  PERFORM private.clear_armed_cycles();
  RETURN new_rule;
END
$function$;
ALTER FUNCTION private.create_pay_when_paid_rule(uuid, uuid, numeric, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.create_pay_when_paid_rule(uuid, uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_pay_when_paid_rule(uuid, uuid, numeric, uuid) TO authenticated;

CREATE FUNCTION private.cancel_pay_when_paid_rule(p_rule_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid(); rule_row app.pay_when_paid_rules%ROWTYPE;
BEGIN
  SELECT * INTO rule_row FROM app.pay_when_paid_rules WHERE rule_id = p_rule_id FOR UPDATE;
  IF NOT FOUND OR rule_row.created_by <> caller_id THEN RAISE EXCEPTION 'rule_owner_required' USING ERRCODE = 'P0001'; END IF;
  IF rule_row.status = 'CANCELLED' THEN RETURN; END IF;
  UPDATE app.pay_when_paid_rules SET status = 'CANCELLED', cancelled_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp(), version_no = version_no + 1 WHERE rule_id = p_rule_id;
  UPDATE app.forwarding_tasks t SET remaining_amount = 0,
    cancel_after_resolution = EXISTS (SELECT 1 FROM app.payment_reports p
      WHERE p.task_id = t.task_id AND p.status = 'PENDING'),
    status = CASE WHEN EXISTS (SELECT 1 FROM app.payment_reports p
      WHERE p.task_id = t.task_id AND p.status = 'PENDING') THEN 'REPORTED' ELSE 'CANCELLED' END,
    updated_at = pg_catalog.clock_timestamp()
  WHERE t.rule_id = p_rule_id AND t.status = 'PENDING';
  UPDATE app.forwarding_tasks t SET cancel_after_resolution = true
  WHERE t.rule_id = p_rule_id AND t.status = 'REPORTED'
    AND EXISTS (SELECT 1 FROM app.payment_reports p WHERE p.task_id = t.task_id AND p.status = 'PENDING');
  INSERT INTO app.forwarding_task_events(task_id, event_type, actor_user_id, amount)
  SELECT task_id, 'TASK_CANCELLED', caller_id, amount FROM app.forwarding_tasks
    WHERE rule_id = p_rule_id AND status = 'CANCELLED';
END
$function$;
ALTER FUNCTION private.cancel_pay_when_paid_rule(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.cancel_pay_when_paid_rule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.cancel_pay_when_paid_rule(uuid) TO authenticated;

CREATE FUNCTION private.allocate_forwarding_tasks(p_payment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE payment app.payment_reports%ROWTYPE; debt app.obligations%ROWTYPE; allocation record;
  created_count integer := 0;
BEGIN
  SELECT * INTO payment FROM app.payment_reports WHERE payment_id = p_payment_id AND status = 'CONFIRMED';
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO debt FROM app.obligations WHERE obligation_id = payment.obligation_id;
  FOR allocation IN
    WITH eligible AS (
      SELECT r.rule_id, r.target_obligation_id, r.remaining_budget,
        o.remaining_amount - private.obligation_reserved_amount(o.obligation_id) AS target_available
      FROM app.pay_when_paid_rules r JOIN app.obligations o ON o.obligation_id = r.target_obligation_id
      WHERE r.created_by = payment.creditor_user_id AND r.trigger_obligation_id = debt.obligation_id
        AND r.status = 'ARMED' AND r.remaining_budget > 0 AND o.status IN ('OPEN', 'PARTIAL')
        AND o.remaining_amount > private.obligation_reserved_amount(o.obligation_id)
    ), grouped AS (
      SELECT e.*, pg_catalog.sum(e.remaining_budget) OVER (PARTITION BY e.target_obligation_id) AS target_budget
      FROM eligible e
    ), caps AS (
      SELECT rule_id, target_obligation_id,
        LEAST(remaining_budget, target_available * remaining_budget / NULLIF(target_budget, 0)) AS cap
      FROM grouped WHERE target_available > 0
    ), pool AS (SELECT COALESCE(pg_catalog.sum(cap), 0) AS cap_total FROM caps),
    target AS (SELECT LEAST(payment.amount, cap_total) AS target_amount FROM pool),
    raw AS (
      SELECT caps.rule_id, caps.target_obligation_id, caps.cap,
        CASE WHEN (SELECT cap_total FROM pool) = 0 THEN 0
          ELSE (SELECT target_amount FROM target) * caps.cap / (SELECT cap_total FROM pool) END AS raw_amount
      FROM caps
    ), base AS (
      SELECT raw.*, pg_catalog.floor(raw_amount * 100) / 100 AS base_amount,
        raw_amount - pg_catalog.floor(raw_amount * 100) / 100 AS fraction
      FROM raw
    ), ranked AS (
      SELECT base.*, pg_catalog.row_number() OVER (ORDER BY fraction DESC, rule_id) AS penny_order,
        ((SELECT target_amount FROM target) * 100 - pg_catalog.sum(base_amount * 100) OVER ())::integer AS pennies_left
      FROM base
    )
    SELECT rule_id, target_obligation_id,
      (base_amount + CASE WHEN penny_order <= pennies_left THEN 0.01 ELSE 0 END)::numeric(12,2) AS amount
    FROM ranked WHERE base_amount + CASE WHEN penny_order <= pennies_left THEN 0.01 ELSE 0 END > 0
    ORDER BY rule_id
  LOOP
    UPDATE app.pay_when_paid_rules SET remaining_budget = remaining_budget - allocation.amount,
      status = CASE WHEN remaining_budget - allocation.amount = 0 THEN 'EXHAUSTED' ELSE 'ARMED' END,
      updated_at = pg_catalog.clock_timestamp(), version_no = version_no + 1
    WHERE rule_id = allocation.rule_id AND status = 'ARMED';
    IF NOT FOUND THEN CONTINUE; END IF;
    INSERT INTO app.forwarding_tasks(rule_id, trigger_payment_id, target_obligation_id,
      amount, remaining_amount, status)
    VALUES (allocation.rule_id, p_payment_id, allocation.target_obligation_id,
      allocation.amount, allocation.amount, 'PENDING')
    ON CONFLICT (rule_id, trigger_payment_id) DO NOTHING;
    IF FOUND THEN
      INSERT INTO app.forwarding_task_events(task_id, event_type, actor_user_id, amount)
      SELECT task_id, 'CREATED', payment.creditor_user_id, allocation.amount
      FROM app.forwarding_tasks WHERE rule_id = allocation.rule_id AND trigger_payment_id = p_payment_id;
      PERFORM private.enqueue_notification(debt.creditor_user_id, 'CASCADES', 'FORWARDING_TASK',
        'Forwarding task created', 'A confirmed receipt created a separate payment task.',
        'forward-task:' || allocation.rule_id::text || ':' || p_payment_id::text);
      created_count := created_count + 1;
    END IF;
  END LOOP;
  RETURN created_count;
END
$function$;
ALTER FUNCTION private.allocate_forwarding_tasks(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.allocate_forwarding_tasks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.allocate_forwarding_tasks(uuid) TO nobroke_executor;

CREATE FUNCTION private.clear_armed_cycles()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE cycle record; net_amount numeric(12,2); cycle_id uuid; count_cycles integer := 0;
BEGIN
  LOOP
    WITH RECURSIVE walk(start_rule, current_rule, rule_ids, obligation_ids, depth, closed) AS (
      SELECT r.rule_id, r.rule_id, ARRAY[r.rule_id]::uuid[], ARRAY[r.trigger_obligation_id]::uuid[], 1, false
      FROM app.pay_when_paid_rules r WHERE r.status = 'ARMED' AND r.remaining_budget > 0
      UNION ALL
      SELECT w.start_rule, next_rule.rule_id, w.rule_ids || next_rule.rule_id,
        w.obligation_ids || next_rule.trigger_obligation_id, w.depth + 1,
        next_rule.rule_id = w.start_rule
      FROM walk w JOIN app.pay_when_paid_rules current_rule ON current_rule.rule_id = w.current_rule
      JOIN app.pay_when_paid_rules next_rule ON next_rule.trigger_obligation_id = current_rule.target_obligation_id
      WHERE NOT w.closed AND w.depth < 25 AND next_rule.status = 'ARMED' AND next_rule.remaining_budget > 0
        AND (next_rule.rule_id = w.start_rule OR
          (next_rule.rule_id > w.start_rule AND NOT next_rule.rule_id = ANY(w.rule_ids)))
    ), cycles AS (
      SELECT rule_ids, obligation_ids FROM walk WHERE closed AND depth >= 2
        AND start_rule = (SELECT item FROM unnest(rule_ids) AS rules(item) ORDER BY item LIMIT 1)
    )
    SELECT rule_ids, ARRAY(SELECT DISTINCT item FROM unnest(obligation_ids) item ORDER BY item) AS obligation_ids
    INTO cycle FROM cycles ORDER BY rule_ids LIMIT 1;
    IF NOT FOUND THEN EXIT; END IF;
    PERFORM 1 FROM app.obligations WHERE obligation_id = ANY(cycle.obligation_ids)
      ORDER BY obligation_id FOR UPDATE;
    PERFORM 1 FROM app.pay_when_paid_rules WHERE rule_id = ANY(cycle.rule_ids)
      ORDER BY rule_id FOR UPDATE;
    SELECT LEAST(
      (SELECT pg_catalog.min(r.remaining_budget) FROM app.pay_when_paid_rules r WHERE r.rule_id = ANY(cycle.rule_ids)),
      (SELECT pg_catalog.min(o.remaining_amount - private.obligation_reserved_amount(o.obligation_id))
        FROM app.obligations o WHERE o.obligation_id = ANY(cycle.obligation_ids)
          AND o.status IN ('OPEN', 'PARTIAL'))
    )::numeric(12,2) INTO net_amount;
    IF COALESCE(net_amount, 0) <= 0 THEN
      UPDATE app.pay_when_paid_rules SET status = 'EXHAUSTED', remaining_budget = 0,
        version_no = version_no + 1, updated_at = pg_catalog.clock_timestamp()
      WHERE rule_id = ANY(cycle.rule_ids) AND status = 'ARMED'
        AND NOT EXISTS (SELECT 1 FROM app.obligations o WHERE o.obligation_id = ANY(cycle.obligation_ids)
          AND o.status IN ('OPEN', 'PARTIAL')
          AND o.remaining_amount > private.obligation_reserved_amount(o.obligation_id));
      EXIT;
    END IF;
    INSERT INTO app.cycle_net_batches(rule_ids, obligation_ids, amount)
    VALUES (ARRAY(SELECT DISTINCT item FROM unnest(cycle.rule_ids) AS rules(item) ORDER BY item),
      cycle.obligation_ids, net_amount) RETURNING cycle_net_id INTO cycle_id;
    UPDATE app.obligations SET remaining_amount = remaining_amount - net_amount,
      status = CASE WHEN remaining_amount - net_amount = 0 THEN 'SETTLED' ELSE 'PARTIAL' END
    WHERE obligation_id = ANY(cycle.obligation_ids);
    INSERT INTO app.settlement_records(obligation_id, settlement_type, cycle_net_id, amount, from_user_id, to_user_id)
    SELECT o.obligation_id, 'CYCLE_NET', cycle_id, net_amount, o.debtor_user_id, o.creditor_user_id
    FROM app.obligations o WHERE o.obligation_id = ANY(cycle.obligation_ids);
    INSERT INTO app.obligation_events(obligation_id, event_type, amount, related_id)
    SELECT o.obligation_id, 'CYCLE_NET', net_amount, cycle_id
    FROM app.obligations o WHERE o.obligation_id = ANY(cycle.obligation_ids);
    UPDATE app.pay_when_paid_rules SET remaining_budget = remaining_budget - net_amount,
      status = CASE WHEN remaining_budget - net_amount = 0 THEN 'EXHAUSTED' ELSE 'ARMED' END,
      version_no = version_no + 1, updated_at = pg_catalog.clock_timestamp()
    WHERE rule_id = ANY(cycle.rule_ids);
    count_cycles := count_cycles + 1;
  END LOOP;
  RETURN count_cycles;
END
$function$;
ALTER FUNCTION private.clear_armed_cycles() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.clear_armed_cycles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.clear_armed_cycles() TO nobroke_executor;

CREATE OR REPLACE FUNCTION private.create_pay_when_paid_rule(
  p_trigger_obligation_id uuid, p_target_obligation_id uuid, p_max_amount numeric, p_request_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); trigger_row app.obligations%ROWTYPE; target_row app.obligations%ROWTYPE;
  request_hash bytea; previous app.pay_when_paid_rules%ROWTYPE; new_rule uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_max_amount IS NULL OR p_max_amount <= 0 OR p_max_amount <> pg_catalog.round(p_max_amount, 2)
     OR p_max_amount > 9999999999.99 OR p_request_id IS NULL
     OR p_trigger_obligation_id = p_target_obligation_id THEN
    RAISE EXCEPTION 'invalid_rule' USING ERRCODE = 'P0001';
  END IF;
  request_hash := private.rule_request_hash(p_trigger_obligation_id, p_target_obligation_id, p_max_amount);
  SELECT * INTO previous FROM app.pay_when_paid_rules WHERE created_by = caller_id AND request_id = p_request_id;
  IF FOUND THEN
    IF previous.request_hash <> request_hash THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001'; END IF;
    RETURN previous.rule_id;
  END IF;
  PERFORM 1 FROM app.obligations WHERE obligation_id IN (p_trigger_obligation_id, p_target_obligation_id)
    ORDER BY obligation_id FOR UPDATE;
  SELECT * INTO trigger_row FROM app.obligations WHERE obligation_id = p_trigger_obligation_id;
  SELECT * INTO target_row FROM app.obligations WHERE obligation_id = p_target_obligation_id;
  IF trigger_row.obligation_id IS NULL OR target_row.obligation_id IS NULL
     OR trigger_row.creditor_user_id <> caller_id OR target_row.debtor_user_id <> caller_id THEN
    RAISE EXCEPTION 'rule_party_relationship_required' USING ERRCODE = 'P0001';
  END IF;
  IF trigger_row.status NOT IN ('OPEN', 'PARTIAL') OR target_row.status NOT IN ('OPEN', 'PARTIAL') THEN
    RAISE EXCEPTION 'rule_obligations_must_be_open' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO app.pay_when_paid_rules(created_by, trigger_obligation_id, target_obligation_id,
    max_budget, remaining_budget, status, request_id, request_hash)
  VALUES (caller_id, p_trigger_obligation_id, p_target_obligation_id,
    p_max_amount::numeric(12,2), p_max_amount::numeric(12,2), 'ARMED', p_request_id, request_hash)
  RETURNING rule_id INTO new_rule;
  PERFORM private.clear_armed_cycles();
  RETURN new_rule;
END
$function$;
ALTER FUNCTION private.create_pay_when_paid_rule(uuid, uuid, numeric, uuid) OWNER TO nobroke_executor;

CREATE FUNCTION private.report_task_payment(p_task_id uuid, p_amount numeric, p_request_id uuid)
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
    IF previous.task_id <> p_task_id OR previous.amount <> p_amount THEN
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

CREATE OR REPLACE FUNCTION private.resolve_payment(p_payment_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); payment app.payment_reports%ROWTYPE; debt app.obligations%ROWTYPE;
  task_row app.forwarding_tasks%ROWTYPE; next_status text;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO payment FROM app.payment_reports WHERE payment_id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO debt FROM app.obligations WHERE obligation_id = payment.obligation_id FOR UPDATE;
  IF payment.task_id IS NOT NULL THEN
    SELECT * INTO task_row FROM app.forwarding_tasks WHERE task_id = payment.task_id FOR UPDATE;
  END IF;
  SELECT * INTO payment FROM app.payment_reports WHERE payment_id = p_payment_id FOR UPDATE;
  IF payment.status <> 'PENDING' THEN
    IF (p_action = 'CONFIRM' AND payment.status = 'CONFIRMED')
       OR (p_action = 'REJECT' AND payment.status = 'REJECTED')
       OR (p_action = 'CANCEL' AND payment.status = 'CANCELLED') THEN
      RETURN pg_catalog.jsonb_build_object('payment_id', payment.payment_id, 'status', payment.status);
    END IF;
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = 'P0001';
  END IF;
  IF (p_action IN ('CONFIRM', 'REJECT') AND caller_id <> payment.creditor_user_id)
     OR (p_action = 'CANCEL' AND caller_id <> payment.debtor_user_id) THEN
    IF p_action = 'CANCEL' THEN RAISE EXCEPTION 'debtor_required' USING ERRCODE = 'P0001';
    ELSE RAISE EXCEPTION 'creditor_required' USING ERRCODE = 'P0001'; END IF;
  END IF;
  next_status := CASE p_action WHEN 'CONFIRM' THEN 'CONFIRMED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'CANCELLED' END;
  IF p_action = 'CONFIRM' THEN
    IF payment.amount > debt.remaining_amount THEN RAISE EXCEPTION 'payment_exceeds_remaining_debt' USING ERRCODE = 'P0001'; END IF;
    UPDATE app.obligations SET remaining_amount = remaining_amount - payment.amount,
      status = CASE WHEN remaining_amount - payment.amount = 0 THEN 'SETTLED' ELSE 'PARTIAL' END
    WHERE obligation_id = debt.obligation_id;
    INSERT INTO app.settlement_records(obligation_id, payment_id, settlement_type, amount, from_user_id, to_user_id)
    VALUES (debt.obligation_id, payment.payment_id, 'EXTERNAL_PAYMENT', payment.amount,
      payment.debtor_user_id, payment.creditor_user_id);
  END IF;
  UPDATE app.payment_reports SET status = next_status, resolved_at = pg_catalog.clock_timestamp(), resolved_by = caller_id
  WHERE payment_id = p_payment_id;
  IF task_row.task_id IS NOT NULL THEN
    IF p_action = 'CONFIRM' THEN
      UPDATE app.forwarding_tasks SET status = CASE
          WHEN remaining_amount = 0 AND NOT EXISTS (SELECT 1 FROM app.payment_reports p
            WHERE p.task_id = task_row.task_id AND p.status = 'PENDING' AND p.payment_id <> p_payment_id)
            THEN 'CONFIRMED' ELSE 'PENDING' END,
        updated_at = pg_catalog.clock_timestamp()
      WHERE task_id = task_row.task_id;
      INSERT INTO app.forwarding_task_events(task_id, event_type, actor_user_id, amount, payment_id)
      VALUES (task_row.task_id, 'PAYMENT_CONFIRMED', caller_id, payment.amount, p_payment_id);
    ELSE
      UPDATE app.forwarding_tasks SET
        remaining_amount = CASE WHEN cancel_after_resolution THEN remaining_amount
          ELSE remaining_amount + payment.amount END,
        status = CASE WHEN cancel_after_resolution THEN 'CANCELLED' ELSE 'PENDING' END,
        updated_at = pg_catalog.clock_timestamp() WHERE task_id = task_row.task_id;
      INSERT INTO app.forwarding_task_events(task_id, event_type, actor_user_id, amount, payment_id)
      VALUES (task_row.task_id, CASE p_action WHEN 'REJECT' THEN 'PAYMENT_REJECTED' ELSE 'PAYMENT_CANCELLED' END,
        caller_id, payment.amount, p_payment_id);
    END IF;
  END IF;
  INSERT INTO app.obligation_events(obligation_id, event_type, actor_user_id, amount, related_id)
  VALUES (payment.obligation_id,
    CASE p_action WHEN 'CONFIRM' THEN 'PAYMENT_CONFIRMED' WHEN 'REJECT' THEN 'PAYMENT_REJECTED' ELSE 'PAYMENT_CANCELLED' END,
    caller_id, payment.amount, payment.payment_id);
  IF p_action = 'CONFIRM' THEN
    PERFORM private.enqueue_notification(payment.debtor_user_id, 'CASCADES', 'PAYMENT_CONFIRMED',
      'Payment confirmed', 'The creditor confirmed your reported payment.', 'payment-confirmed:' || payment.payment_id::text);
    PERFORM private.enqueue_notification(payment.creditor_user_id, 'CASCADES', 'PAYMENT_CONFIRMED',
      'Payment recorded', 'The confirmed payment reduced this obligation.', 'payment-confirmed-creditor:' || payment.payment_id::text);
    PERFORM private.allocate_forwarding_tasks(payment.payment_id);
    PERFORM private.clear_armed_cycles();
  END IF;
  RETURN pg_catalog.jsonb_build_object('payment_id', payment.payment_id, 'status', next_status,
    'amount', payment.amount::text, 'obligation_id', payment.obligation_id);
END
$function$;
ALTER FUNCTION private.resolve_payment(uuid, text) OWNER TO nobroke_executor;

CREATE FUNCTION private.preview_pay_when_paid_rule(p_trigger uuid, p_target uuid, p_max_amount numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid(); trigger_row app.obligations%ROWTYPE; target_row app.obligations%ROWTYPE;
  creates_cycle boolean := false; cycle_amount numeric(12,2) := 0;
BEGIN
  SELECT * INTO trigger_row FROM app.obligations WHERE obligation_id = p_trigger;
  SELECT * INTO target_row FROM app.obligations WHERE obligation_id = p_target;
  IF trigger_row.creditor_user_id <> caller_id OR target_row.debtor_user_id <> caller_id
     OR p_max_amount IS NULL OR p_max_amount <= 0 THEN
    RAISE EXCEPTION 'rule_party_relationship_required' USING ERRCODE = 'P0001';
  END IF;
  WITH RECURSIVE path(current_obligation, obligations, budgets, depth) AS (
    SELECT p_target, ARRAY[p_target]::uuid[], ARRAY[]::numeric[], 0
    UNION ALL
    SELECT r.target_obligation_id, path.obligations || r.target_obligation_id,
      path.budgets || r.remaining_budget, path.depth + 1
    FROM path JOIN app.pay_when_paid_rules r ON r.trigger_obligation_id = path.current_obligation
    WHERE r.status = 'ARMED' AND r.remaining_budget > 0
      AND path.depth < 24 AND NOT r.target_obligation_id = ANY(path.obligations)
  )
  SELECT EXISTS (SELECT 1 FROM path WHERE current_obligation = p_trigger AND depth > 0),
    COALESCE((SELECT LEAST(p_max_amount,
      (SELECT pg_catalog.min(o.remaining_amount - private.obligation_reserved_amount(o.obligation_id))
        FROM app.obligations o WHERE o.obligation_id = ANY(path.obligations || p_trigger)),
      (SELECT pg_catalog.min(budget) FROM unnest(path.budgets || p_max_amount) budget))
      FROM path WHERE current_obligation = p_trigger AND depth > 0 LIMIT 1), 0)::numeric(12,2)
  INTO creates_cycle, cycle_amount;
  RETURN pg_catalog.jsonb_build_object('creates_cycle', creates_cycle, 'cycle_net_amount', cycle_amount::text);
END
$function$;
ALTER FUNCTION private.preview_pay_when_paid_rule(uuid, uuid, numeric) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.preview_pay_when_paid_rule(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.preview_pay_when_paid_rule(uuid, uuid, numeric) TO authenticated;

CREATE FUNCTION api.create_pay_when_paid_rule(p_trigger_obligation_id uuid, p_target_obligation_id uuid,
  p_max_amount numeric, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE rule_id uuid; BEGIN PERFORM private.lock_financial_writes();
  rule_id := private.create_pay_when_paid_rule(p_trigger_obligation_id, p_target_obligation_id, p_max_amount, p_request_id);
  RETURN pg_catalog.jsonb_build_object('rule_id', rule_id, 'status', 'ARMED');
END $$;
CREATE FUNCTION api.cancel_pay_when_paid_rule(p_rule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN PERFORM private.lock_financial_writes(); PERFORM private.cancel_pay_when_paid_rule(p_rule_id);
  RETURN pg_catalog.jsonb_build_object('rule_id', p_rule_id, 'status', 'CANCELLED');
END $$;
CREATE FUNCTION api.preview_pay_when_paid_rule(p_trigger_obligation_id uuid, p_target_obligation_id uuid,
  p_max_amount numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
  BEGIN RETURN private.preview_pay_when_paid_rule(p_trigger_obligation_id, p_target_obligation_id, p_max_amount); END $$;
CREATE FUNCTION api.report_task_payment(p_task_id uuid, p_amount numeric, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE payment uuid; BEGIN PERFORM private.lock_financial_writes();
  payment := private.report_task_payment(p_task_id, p_amount, p_request_id);
  RETURN pg_catalog.jsonb_build_object('payment_id', payment, 'status', 'PENDING');
END $$;
CREATE FUNCTION private.list_my_pay_when_paid_rules(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
DECLARE caller_id uuid := auth.uid(); result jsonb;
BEGIN
  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY rule_id), '[]'::jsonb) INTO result
  FROM (SELECT r.rule_id, pg_catalog.jsonb_build_object(
    'rule_id', r.rule_id, 'trigger_obligation_id', r.trigger_obligation_id,
    'target_obligation_id', r.target_obligation_id, 'max_budget', r.max_budget::text,
    'remaining_budget', r.remaining_budget::text, 'status', r.status, 'created_at', r.created_at::text,
    'trigger_title', te.title, 'target_title', oe.title,
    'trigger_counterparty_id', incoming.debtor_user_id,
    'target_counterparty_id', outgoing.creditor_user_id
  ) AS item FROM app.pay_when_paid_rules r
    JOIN app.obligations incoming ON incoming.obligation_id = r.trigger_obligation_id
    JOIN app.expenses te ON te.expense_id = incoming.source_expense_id
    JOIN app.obligations outgoing ON outgoing.obligation_id = r.target_obligation_id
    JOIN app.expenses oe ON oe.expense_id = outgoing.source_expense_id
    WHERE r.created_by = caller_id AND (p_after_id IS NULL OR r.rule_id > p_after_id)
    ORDER BY r.rule_id LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)) page;
  RETURN result;
END $$;
ALTER FUNCTION private.list_my_pay_when_paid_rules(uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_my_pay_when_paid_rules(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_my_pay_when_paid_rules(uuid, integer) TO authenticated;

CREATE FUNCTION private.list_forwarding_tasks(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
DECLARE caller_id uuid := auth.uid(); result jsonb;
BEGIN
  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY task_id), '[]'::jsonb) INTO result
  FROM (SELECT t.task_id, pg_catalog.jsonb_build_object(
    'task_id', t.task_id, 'rule_id', t.rule_id, 'trigger_payment_id', t.trigger_payment_id,
    'target_obligation_id', t.target_obligation_id, 'amount', t.amount::text,
    'remaining_amount', t.remaining_amount::text, 'status', t.status,
    'expense_title', e.title, 'creditor_user_id', o.creditor_user_id,
    'creditor_name', creditor.display_name, 'created_at', t.created_at::text
  ) AS item FROM app.forwarding_tasks t
    JOIN app.obligations o ON o.obligation_id = t.target_obligation_id
    JOIN app.expenses e ON e.expense_id = o.source_expense_id
    JOIN app.profiles creditor ON creditor.user_id = o.creditor_user_id
    JOIN app.pay_when_paid_rules r ON r.rule_id = t.rule_id
    WHERE caller_id IN (r.created_by, o.debtor_user_id, o.creditor_user_id)
      AND (p_after_id IS NULL OR t.task_id > p_after_id)
    ORDER BY t.task_id LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)) page;
  RETURN result;
END $$;
ALTER FUNCTION private.list_forwarding_tasks(uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_forwarding_tasks(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_forwarding_tasks(uuid, integer) TO authenticated;

CREATE FUNCTION private.list_cycle_net_batches(p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
DECLARE caller_id uuid := auth.uid(); result jsonb;
BEGIN
  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY created_at DESC, cycle_net_id DESC), '[]'::jsonb) INTO result
  FROM (SELECT b.cycle_net_id, b.created_at, pg_catalog.jsonb_build_object(
    'cycle_net_id', b.cycle_net_id, 'amount', b.amount::text, 'created_at', b.created_at::text,
    'rule_count', pg_catalog.cardinality(b.rule_ids), 'obligation_count', pg_catalog.cardinality(b.obligation_ids)
  ) AS item FROM app.cycle_net_batches b
    WHERE EXISTS (SELECT 1 FROM app.obligations o WHERE o.obligation_id = ANY(b.obligation_ids)
      AND caller_id IN (o.debtor_user_id, o.creditor_user_id))
      AND (p_after_created_at IS NULL OR (b.created_at, b.cycle_net_id) < (p_after_created_at, p_after_id))
    ORDER BY b.created_at DESC, b.cycle_net_id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)) page;
  RETURN result;
END $$;
ALTER FUNCTION private.list_cycle_net_batches(timestamptz, uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_cycle_net_batches(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_cycle_net_batches(timestamptz, uuid, integer) TO authenticated;

CREATE FUNCTION api.list_my_pay_when_paid_rules(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT private.list_my_pay_when_paid_rules(p_after_id, p_limit)
$$;
CREATE FUNCTION api.list_forwarding_tasks(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT private.list_forwarding_tasks(p_after_id, p_limit)
$$;

CREATE FUNCTION api.list_cycle_net_batches(p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT private.list_cycle_net_batches(p_after_created_at, p_after_id, p_limit)
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO authenticated;

CREATE FUNCTION private.reject_route_with_dependencies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM app.payment_reports p
    WHERE p.obligation_id = ANY(NEW.source_obligation_ids) AND p.status = 'PENDING')
    OR EXISTS (SELECT 1 FROM app.pay_when_paid_rules r
      WHERE r.status = 'ARMED' AND (r.trigger_obligation_id = ANY(NEW.source_obligation_ids)
        OR r.target_obligation_id = ANY(NEW.source_obligation_ids)))
    OR EXISTS (SELECT 1 FROM app.forwarding_tasks t
      WHERE t.target_obligation_id = ANY(NEW.source_obligation_ids) AND t.status IN ('PENDING', 'REPORTED')) THEN
    RAISE EXCEPTION 'route_dependencies_active' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION private.reject_route_with_dependencies() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.reject_route_with_dependencies() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER route_preview_dependencies BEFORE INSERT ON app.route_previews
  FOR EACH ROW EXECUTE FUNCTION private.reject_route_with_dependencies();
CREATE TRIGGER route_operation_dependencies BEFORE INSERT ON app.route_operations
  FOR EACH ROW EXECUTE FUNCTION private.reject_route_with_dependencies();
