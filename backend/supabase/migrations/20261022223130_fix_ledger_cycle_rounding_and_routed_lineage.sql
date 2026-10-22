-- Keep cycle reductions bounded by every live leg and preserve route lineage
-- through repeated multi-hop reallocations.

CREATE OR REPLACE FUNCTION private.allocate_forwarding_tasks(p_payment_id uuid)
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
    ), target_caps AS (
      SELECT target_obligation_id,
        LEAST(pg_catalog.min(target_available), pg_catalog.sum(remaining_budget)) AS capacity
      FROM eligible GROUP BY target_obligation_id
    ), pool AS (SELECT COALESCE(pg_catalog.sum(capacity), 0) AS cap_total FROM target_caps),
    target AS (SELECT LEAST(payment.amount, cap_total) AS target_amount FROM pool),
    target_raw AS (
      SELECT c.target_obligation_id, c.capacity,
        CASE WHEN (SELECT cap_total FROM pool) = 0 THEN 0
          ELSE (SELECT target_amount FROM target) * c.capacity / (SELECT cap_total FROM pool) END AS raw_amount
      FROM target_caps c
    ), target_base AS (
      SELECT target_raw.*, pg_catalog.floor(raw_amount * 100) / 100 AS base_amount,
        raw_amount - pg_catalog.floor(raw_amount * 100) / 100 AS fraction
      FROM target_raw
    ), target_ranked AS (
      SELECT target_base.*,
        pg_catalog.row_number() OVER (ORDER BY fraction DESC, target_obligation_id) AS penny_order,
        ((SELECT target_amount FROM target) * 100 - pg_catalog.sum(base_amount * 100) OVER ())::integer AS pennies_left
      FROM target_base
    ), target_allocations AS (
      SELECT target_obligation_id,
        (base_amount + CASE WHEN penny_order <= pennies_left THEN 0.01 ELSE 0 END)::numeric(12,2) AS amount
      FROM target_ranked
      WHERE base_amount + CASE WHEN penny_order <= pennies_left THEN 0.01 ELSE 0 END > 0
    ), rule_raw AS (
      SELECT e.rule_id, e.target_obligation_id, e.remaining_budget, t.amount AS target_amount,
        t.amount * e.remaining_budget / NULLIF(pg_catalog.sum(e.remaining_budget)
          OVER (PARTITION BY e.target_obligation_id), 0) AS raw_amount
      FROM eligible e JOIN target_allocations t USING (target_obligation_id)
    ), rule_base AS (
      SELECT rule_raw.*, pg_catalog.floor(raw_amount * 100) / 100 AS base_amount,
        raw_amount - pg_catalog.floor(raw_amount * 100) / 100 AS fraction
      FROM rule_raw
    ), rule_ranked AS (
      SELECT rule_base.*,
        pg_catalog.row_number() OVER (PARTITION BY target_obligation_id ORDER BY fraction DESC, rule_id) AS penny_order,
        ((pg_catalog.max(target_amount) OVER (PARTITION BY target_obligation_id) * 100)
          - pg_catalog.sum(base_amount * 100) OVER (PARTITION BY target_obligation_id))::integer AS pennies_left
      FROM rule_base
    )
    SELECT rule_id, target_obligation_id,
      (base_amount + CASE WHEN penny_order <= pennies_left THEN 0.01 ELSE 0 END)::numeric(12,2) AS amount
    FROM rule_ranked
    WHERE base_amount + CASE WHEN penny_order <= pennies_left THEN 0.01 ELSE 0 END > 0
    ORDER BY target_obligation_id, rule_id
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
      PERFORM private.enqueue_notification(payment.creditor_user_id, 'CASCADES', 'FORWARDING_TASK',
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

CREATE OR REPLACE FUNCTION private.clear_armed_cycles()
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
      SELECT rule_ids, obligation_ids FROM walk
      WHERE closed AND depth >= 2
        AND start_rule = (SELECT item FROM unnest(rule_ids) AS rules(item) ORDER BY item LIMIT 1)
        AND NOT EXISTS (
          SELECT 1 FROM unnest(obligation_ids) AS cycle_leg(obligation_id)
          LEFT JOIN app.obligations o ON o.obligation_id = cycle_leg.obligation_id
          WHERE o.obligation_id IS NULL OR o.status NOT IN ('OPEN', 'PARTIAL')
            OR o.remaining_amount <= private.obligation_reserved_amount(o.obligation_id)
        )
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
    IF COALESCE(net_amount, 0) <= 0 THEN EXIT; END IF;
    INSERT INTO app.cycle_net_batches(rule_ids, obligation_ids, amount)
    VALUES (ARRAY(SELECT DISTINCT item FROM unnest(cycle.rule_ids) AS rules(item) ORDER BY item),
      cycle.obligation_ids, net_amount) RETURNING cycle_net_id INTO cycle_id;
    UPDATE app.obligations SET remaining_amount = remaining_amount - net_amount,
      status = CASE WHEN remaining_amount - net_amount = 0 THEN 'SETTLED' ELSE 'PARTIAL' END
    WHERE obligation_id = ANY(cycle.obligation_ids)
      AND status IN ('OPEN', 'PARTIAL')
      AND remaining_amount - private.obligation_reserved_amount(obligation_id) >= net_amount;
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

CREATE OR REPLACE FUNCTION private.assert_member_can_leave(p_group_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.obligations AS o WHERE o.source_group_id = p_group_id
      AND (o.debtor_user_id = p_user_id OR o.creditor_user_id = p_user_id)
      AND o.status IN ('OPEN', 'PARTIAL')
  ) THEN RAISE EXCEPTION 'group_member_has_open_obligations' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (
    WITH RECURSIVE routed_lineage(obligation_id) AS (
      SELECT r.resulting_obligation_id
      FROM app.route_operations r
      JOIN app.obligations source ON source.obligation_id = ANY(r.source_obligation_ids)
      WHERE source.source_group_id = p_group_id
        AND (source.debtor_user_id = p_user_id OR source.creditor_user_id = p_user_id)
        AND r.resulting_obligation_id IS NOT NULL
      UNION
      SELECT r.resulting_obligation_id
      FROM routed_lineage lineage
      JOIN app.route_operations r ON lineage.obligation_id = ANY(r.source_obligation_ids)
      WHERE r.resulting_obligation_id IS NOT NULL
    )
    SELECT 1 FROM routed_lineage lineage
    JOIN app.obligations current_o ON current_o.obligation_id = lineage.obligation_id
    WHERE current_o.status IN ('OPEN', 'PARTIAL')
  ) THEN RAISE EXCEPTION 'group_member_has_routed_exposure' USING ERRCODE = 'P0001'; END IF;
END
$function$;
ALTER FUNCTION private.assert_member_can_leave(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.assert_member_can_leave(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_member_can_leave(uuid, uuid) TO nobroke_executor;
