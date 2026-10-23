-- Global friend settlement preserves source obligations and applies their
-- reductions only after the receiving friend confirms each outside payment.

CREATE TABLE app.global_netting_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE TABLE app.global_settlement_plans (
  plan_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  request_hash bytea NOT NULL,
  status text NOT NULL CHECK (status IN ('PREVIEW', 'ACCEPTED', 'PARTIAL', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  participant_ids uuid[] NOT NULL,
  source_obligation_ids uuid[] NOT NULL,
  version_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  completed_at timestamptz,
  UNIQUE (created_by, request_id),
  CHECK (pg_catalog.cardinality(participant_ids) > 0),
  CHECK (pg_catalog.cardinality(source_obligation_ids) > 0)
);
CREATE INDEX global_settlement_plans_creator ON app.global_settlement_plans(created_by, created_at DESC);

CREATE TABLE app.global_settlement_participants (
  plan_id uuid NOT NULL REFERENCES app.global_settlement_plans(plan_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  participant_role text NOT NULL CHECK (participant_role IN ('CREATOR', 'INVOLVED')),
  PRIMARY KEY (plan_id, user_id)
);
CREATE INDEX global_settlement_participants_user ON app.global_settlement_participants(user_id, plan_id);

CREATE TABLE app.global_settlement_transfers (
  transfer_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES app.global_settlement_plans(plan_id) ON DELETE RESTRICT,
  transfer_order integer NOT NULL CHECK (transfer_order > 0),
  debtor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creditor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('PLANNED', 'ACCEPTED', 'PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
  report_request_id uuid,
  reported_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (debtor_user_id <> creditor_user_id),
  CHECK ((status = 'PENDING' AND report_request_id IS NOT NULL AND reported_at IS NOT NULL
          AND resolved_at IS NULL AND resolved_by IS NULL)
      OR (status IN ('PLANNED', 'ACCEPTED') AND report_request_id IS NULL AND reported_at IS NULL
          AND resolved_at IS NULL AND resolved_by IS NULL)
      OR (status IN ('CONFIRMED', 'REJECTED') AND report_request_id IS NOT NULL
          AND reported_at IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
      OR (status = 'CANCELLED' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL
          AND ((report_request_id IS NULL AND reported_at IS NULL)
            OR (report_request_id IS NOT NULL AND reported_at IS NOT NULL)))),
  UNIQUE (plan_id, transfer_order),
  UNIQUE (debtor_user_id, report_request_id)
);
CREATE INDEX global_settlement_transfers_plan ON app.global_settlement_transfers(plan_id, transfer_order);
CREATE INDEX global_settlement_transfers_parties ON app.global_settlement_transfers(debtor_user_id, creditor_user_id, created_at DESC);

CREATE TABLE app.global_settlement_allocations (
  allocation_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES app.global_settlement_transfers(transfer_id) ON DELETE RESTRICT,
  obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  source_group_id uuid NOT NULL REFERENCES app.expense_groups(group_id) ON DELETE RESTRICT,
  source_expense_id uuid NOT NULL REFERENCES app.expenses(expense_id) ON DELETE RESTRICT,
  allocation_kind text NOT NULL CHECK (allocation_kind IN ('PATH_CLEAR', 'CYCLE_CLEAR')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX global_settlement_allocations_transfer ON app.global_settlement_allocations(transfer_id, allocation_id);
CREATE INDEX global_settlement_allocations_obligation ON app.global_settlement_allocations(obligation_id, transfer_id);

CREATE TABLE app.global_settlement_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES app.global_settlement_plans(plan_id) ON DELETE RESTRICT,
  transfer_id uuid REFERENCES app.global_settlement_transfers(transfer_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'PREVIEWED', 'ACCEPTED', 'PAYMENT_REPORTED', 'PAYMENT_CONFIRMED',
    'PAYMENT_REJECTED', 'PAYMENT_CANCELLED', 'PLAN_COMPLETED', 'PLAN_EXPIRED'
  )),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(12,2) CHECK (amount IS NULL OR amount >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX global_settlement_events_plan ON app.global_settlement_events(plan_id, event_id);

ALTER TABLE app.settlement_records
  ADD COLUMN global_transfer_id uuid REFERENCES app.global_settlement_transfers(transfer_id) ON DELETE RESTRICT;
ALTER TABLE app.settlement_records DROP CONSTRAINT settlement_records_settlement_type_check;
ALTER TABLE app.settlement_records ADD CONSTRAINT settlement_records_settlement_type_check
  CHECK (settlement_type IN ('EXTERNAL_PAYMENT', 'ROUTE', 'CYCLE_NET', 'GLOBAL_PAYMENT', 'GLOBAL_NET'));
ALTER TABLE app.obligation_events DROP CONSTRAINT obligation_events_event_type_check;
ALTER TABLE app.obligation_events ADD CONSTRAINT obligation_events_event_type_check CHECK (event_type IN (
  'CREATED', 'PAYMENT_REPORTED', 'PAYMENT_REJECTED', 'PAYMENT_CANCELLED',
  'PAYMENT_CONFIRMED', 'ROUTED_OUT', 'ROUTED_IN', 'CYCLE_NET', 'VOIDED', 'GLOBAL_SETTLEMENT'
));

DO $rls$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'global_netting_preferences', 'global_settlement_plans', 'global_settlement_participants',
    'global_settlement_transfers', 'global_settlement_allocations', 'global_settlement_events'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON app.%I TO nobroke_executor USING (true) WITH CHECK (true)',
      table_name || '_executor', table_name);
  END LOOP;
END
$rls$;

GRANT SELECT, INSERT, UPDATE ON app.global_netting_preferences, app.global_settlement_plans,
  app.global_settlement_transfers TO nobroke_executor;
GRANT SELECT, INSERT ON app.global_settlement_participants, app.global_settlement_allocations,
  app.global_settlement_events TO nobroke_executor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO nobroke_executor;

CREATE TRIGGER global_settlement_allocations_immutable BEFORE UPDATE OR DELETE
  ON app.global_settlement_allocations FOR EACH ROW
  EXECUTE FUNCTION private.reject_immutable_event_mutation();
CREATE TRIGGER global_settlement_events_immutable BEFORE UPDATE OR DELETE
  ON app.global_settlement_events FOR EACH ROW
  EXECUTE FUNCTION private.reject_immutable_event_mutation();

CREATE FUNCTION private.get_global_netting_preference()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  RETURN pg_catalog.jsonb_build_object('enabled', COALESCE((
    SELECT p.enabled FROM app.global_netting_preferences p WHERE p.user_id = caller_id
  ), true));
END
$function$;
ALTER FUNCTION private.get_global_netting_preference() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.get_global_netting_preference() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_global_netting_preference() TO authenticated;

CREATE FUNCTION private.set_global_netting_preference(p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'invalid_global_netting_preference' USING ERRCODE = 'P0001'; END IF;
  PERFORM private.lock_financial_writes();
  INSERT INTO app.global_netting_preferences(user_id, enabled)
  VALUES (caller_id, p_enabled)
  ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled,
    updated_at = pg_catalog.clock_timestamp();
  RETURN pg_catalog.jsonb_build_object('enabled', p_enabled);
END
$function$;
ALTER FUNCTION private.set_global_netting_preference(boolean) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.set_global_netting_preference(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_global_netting_preference(boolean) TO authenticated;

CREATE FUNCTION api.get_global_netting_preference()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.get_global_netting_preference()
$$;
CREATE FUNCTION api.set_global_netting_preference(p_enabled boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.set_global_netting_preference(p_enabled)
$$;

ALTER FUNCTION api.get_global_netting_preference() SET search_path = pg_catalog;
ALTER FUNCTION api.set_global_netting_preference(boolean) SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION api.get_global_netting_preference() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.set_global_netting_preference(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_global_netting_preference() TO authenticated;
GRANT EXECUTE ON FUNCTION api.set_global_netting_preference(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION private.obligation_reserved_amount(p_obligation_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT (
    COALESCE((SELECT pg_catalog.sum(r.amount) FROM app.payment_reports r
      WHERE r.obligation_id = p_obligation_id AND r.status = 'PENDING'), 0)
    + COALESCE((SELECT pg_catalog.sum(t.remaining_amount) FROM app.forwarding_tasks t
      WHERE t.target_obligation_id = p_obligation_id AND t.status = 'PENDING'), 0)
    + COALESCE((SELECT pg_catalog.sum(a.amount)
      FROM app.global_settlement_allocations a
      JOIN app.global_settlement_transfers t ON t.transfer_id = a.transfer_id
      WHERE a.obligation_id = p_obligation_id AND t.status IN ('ACCEPTED', 'PENDING')), 0)
  )::numeric(12,2)
$$;
ALTER FUNCTION private.obligation_reserved_amount(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.obligation_reserved_amount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.obligation_reserved_amount(uuid) TO nobroke_executor;

CREATE OR REPLACE FUNCTION private.get_dashboard_balances()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'user_id', peer.user_id, 'username', peer.username, 'display_name', peer.display_name,
    'net_amount', peer.net_amount::numeric(12,2)::text,
    'available_to_pay', GREATEST(-peer.net_amount - peer.reserved_outgoing, 0)::numeric(12,2)::text
  ) ORDER BY peer.net_amount DESC, peer.user_id), '[]'::jsonb)
  FROM (
    SELECT p.user_id, p.username, p.display_name,
      pg_catalog.sum(CASE WHEN o.creditor_user_id = auth.uid()
        THEN o.remaining_amount ELSE -o.remaining_amount END) AS net_amount,
      COALESCE((SELECT pg_catalog.sum(private.obligation_reserved_amount(outgoing.obligation_id))
        FROM app.obligations outgoing
        WHERE outgoing.debtor_user_id = auth.uid() AND outgoing.creditor_user_id = p.user_id
          AND outgoing.status IN ('OPEN', 'PARTIAL')), 0) AS reserved_outgoing
    FROM app.obligations o
    JOIN app.profiles p ON p.user_id = CASE WHEN o.debtor_user_id = auth.uid()
      THEN o.creditor_user_id ELSE o.debtor_user_id END
    WHERE auth.uid() IN (o.debtor_user_id, o.creditor_user_id)
      AND o.status IN ('OPEN', 'PARTIAL')
    GROUP BY p.user_id, p.username, p.display_name
  ) AS peer
$$;
ALTER FUNCTION private.get_dashboard_balances() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.get_dashboard_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_dashboard_balances() TO authenticated;

CREATE OR REPLACE FUNCTION private.list_my_friends(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(row_value ORDER BY friendship_id), '[]'::jsonb)
  FROM (
    SELECT f.friendship_id, pg_catalog.jsonb_build_object(
      'friendship_id', f.friendship_id, 'friend_id', peer.user_id,
      'username', peer.username, 'display_name', peer.display_name,
      'status', f.status, 'requested_by', f.requested_by,
      'global_netting_enabled', CASE WHEN f.status = 'ACTIVE' THEN COALESCE((
        SELECT p.enabled FROM app.global_netting_preferences p WHERE p.user_id = peer.user_id
      ), true) ELSE false END,
      'trust_limit_me_to_them', COALESCE((SELECT t.limit_amount::text FROM app.trust_grants t
        WHERE t.creditor_user_id = auth.uid() AND t.debtor_user_id = peer.user_id), '0.00'),
      'trust_limit_them_to_me', COALESCE((SELECT t.limit_amount::text FROM app.trust_grants t
        WHERE t.creditor_user_id = peer.user_id AND t.debtor_user_id = auth.uid()), '0.00'),
      'exposure_me_to_them', COALESCE((SELECT pg_catalog.sum(o.remaining_amount)::text FROM app.obligations o
        WHERE o.is_routed AND o.debtor_user_id = peer.user_id AND o.creditor_user_id = auth.uid()
          AND o.status IN ('OPEN', 'PARTIAL')), '0'),
      'exposure_them_to_me', COALESCE((SELECT pg_catalog.sum(o.remaining_amount)::text FROM app.obligations o
        WHERE o.is_routed AND o.debtor_user_id = auth.uid() AND o.creditor_user_id = peer.user_id
          AND o.status IN ('OPEN', 'PARTIAL')), '0')
    ) AS row_value
    FROM app.friendships f
    JOIN app.profiles peer ON peer.user_id = CASE WHEN f.user_a = auth.uid() THEN f.user_b ELSE f.user_a END
    WHERE (f.user_a = auth.uid() OR f.user_b = auth.uid())
      AND (p_after_id IS NULL OR f.friendship_id > p_after_id)
    ORDER BY f.friendship_id LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) page
$$;
ALTER FUNCTION private.list_my_friends(uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_my_friends(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_my_friends(uuid, integer) TO authenticated;

CREATE FUNCTION private.global_settlement_candidate_snapshot(p_caller_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $$
  WITH RECURSIVE friend_users(user_id) AS (
    SELECT p_caller_id
    WHERE COALESCE((SELECT p.enabled FROM app.global_netting_preferences p
      WHERE p.user_id = p_caller_id), true)
    UNION
    SELECT CASE WHEN f.user_a = u.user_id THEN f.user_b ELSE f.user_a END
    FROM friend_users u
    JOIN app.friendships f ON f.status = 'ACTIVE'
      AND (f.user_a = u.user_id OR f.user_b = u.user_id)
    WHERE COALESCE((SELECT p.enabled FROM app.global_netting_preferences p
      WHERE p.user_id = CASE WHEN f.user_a = u.user_id THEN f.user_b ELSE f.user_a END), true)
  ), eligible_debts AS (
    SELECT o.*
    FROM app.obligations o
    WHERE o.status IN ('OPEN', 'PARTIAL')
      AND o.remaining_amount > 0
      AND EXISTS (SELECT 1 FROM friend_users u WHERE u.user_id = o.debtor_user_id)
      AND EXISTS (SELECT 1 FROM friend_users u WHERE u.user_id = o.creditor_user_id)
      AND EXISTS (SELECT 1 FROM app.friendships f
        WHERE f.status = 'ACTIVE'
          AND f.user_a = LEAST(o.debtor_user_id, o.creditor_user_id)
          AND f.user_b = GREATEST(o.debtor_user_id, o.creditor_user_id))
      AND private.obligation_reserved_amount(o.obligation_id) = 0
      AND EXISTS (SELECT 1 FROM app.expenses e
        WHERE e.expense_id = o.source_expense_id AND e.status = 'POSTED')
      AND NOT EXISTS (SELECT 1 FROM app.payment_reports r
        WHERE r.obligation_id = o.obligation_id AND r.status = 'PENDING')
      AND NOT EXISTS (SELECT 1 FROM app.forwarding_tasks t
        WHERE t.target_obligation_id = o.obligation_id AND t.status IN ('PENDING', 'REPORTED'))
      AND NOT EXISTS (SELECT 1 FROM app.pay_when_paid_rules r
        WHERE r.status = 'ARMED'
          AND o.obligation_id IN (r.trigger_obligation_id, r.target_obligation_id))
  ), debt_component(user_id) AS (
    SELECT p_caller_id
    UNION
    SELECT CASE WHEN o.debtor_user_id = u.user_id THEN o.creditor_user_id ELSE o.debtor_user_id END
    FROM debt_component u
    JOIN eligible_debts o ON o.debtor_user_id = u.user_id OR o.creditor_user_id = u.user_id
  ), component_debts AS (
    SELECT o.* FROM eligible_debts o
    WHERE EXISTS (SELECT 1 FROM debt_component u WHERE u.user_id = o.debtor_user_id)
      AND EXISTS (SELECT 1 FROM debt_component u WHERE u.user_id = o.creditor_user_id)
  )
  SELECT pg_catalog.jsonb_build_object(
    'users', COALESCE((SELECT pg_catalog.to_jsonb(pg_catalog.array_agg(user_id ORDER BY user_id))
      FROM debt_component), '[]'::jsonb),
    'obligations', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'obligation_id', o.obligation_id,
        'debtor_user_id', o.debtor_user_id,
        'creditor_user_id', o.creditor_user_id,
        'source_group_id', o.source_group_id,
        'source_expense_id', o.source_expense_id,
        'remaining_amount', o.remaining_amount::text,
        'version_no', o.version_no::text,
        'group_name', g.group_name,
        'expense_title', e.title
      ) ORDER BY o.obligation_id)
      FROM component_debts o
      JOIN app.expense_groups g ON g.group_id = o.source_group_id
      JOIN app.expenses e ON e.expense_id = o.source_expense_id
    ), '[]'::jsonb)
  )
$$;
ALTER FUNCTION private.global_settlement_candidate_snapshot(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.global_settlement_candidate_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.global_settlement_candidate_snapshot(uuid) TO nobroke_executor;

CREATE FUNCTION private.take_global_edge_allocation(p_sources jsonb, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE source_row jsonb; remaining numeric; take_amount numeric; amount_left numeric := p_amount;
  used_rows jsonb := '[]'::jsonb; next_sources jsonb := '[]'::jsonb;
BEGIN
  FOR source_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_sources) LOOP
    remaining := (source_row ->> 'remaining_amount')::numeric;
    take_amount := LEAST(remaining, amount_left);
    IF take_amount > 0 THEN
      used_rows := used_rows || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'obligation_id', source_row ->> 'obligation_id',
        'source_group_id', source_row ->> 'source_group_id',
        'source_expense_id', source_row ->> 'source_expense_id',
        'amount', take_amount::numeric(12,2)::text
      ));
      amount_left := amount_left - take_amount;
    END IF;
    next_sources := next_sources || pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(
      source_row, '{remaining_amount}', pg_catalog.to_jsonb((remaining - take_amount)::numeric(12,2)::text)));
  END LOOP;
  IF amount_left <> 0 THEN RAISE EXCEPTION 'global_settlement_allocation_overflow' USING ERRCODE = 'P0001'; END IF;
  RETURN pg_catalog.jsonb_build_object('allocations', used_rows, 'sources', next_sources);
END
$function$;
ALTER FUNCTION private.take_global_edge_allocation(jsonb, numeric) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.take_global_edge_allocation(jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.take_global_edge_allocation(jsonb, numeric) TO nobroke_executor;

CREATE FUNCTION private.first_global_settlement_cycle(p_debtors uuid[], p_creditors uuid[], p_amounts numeric[])
RETURNS integer[] LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  WITH RECURSIVE edges(edge_no, debtor_id, creditor_id, amount) AS (
    SELECT i, p_debtors[i], p_creditors[i], p_amounts[i]
    FROM pg_catalog.generate_subscripts(p_debtors, 1) AS i
    WHERE p_amounts[i] > 0
  ), walk(start_id, current_id, user_path, edge_path) AS (
    SELECT e.debtor_id, e.creditor_id, ARRAY[e.debtor_id, e.creditor_id], ARRAY[e.edge_no]
    FROM edges e
    UNION ALL
    SELECT w.start_id, e.creditor_id, w.user_path || e.creditor_id, w.edge_path || e.edge_no
    FROM walk w JOIN edges e ON e.debtor_id = w.current_id
    WHERE e.amount > 0
      AND pg_catalog.cardinality(w.user_path) < pg_catalog.cardinality(p_debtors) + 1
      AND NOT e.creditor_id = ANY(w.user_path)
  )
  SELECT w.edge_path || e.edge_no
  FROM walk w JOIN edges e ON e.debtor_id = w.current_id AND e.creditor_id = w.start_id
  WHERE e.amount > 0
    AND w.start_id = (SELECT u FROM pg_catalog.unnest(w.user_path) AS u ORDER BY u LIMIT 1)
  ORDER BY w.edge_path, e.edge_no
  LIMIT 1
$$;
ALTER FUNCTION private.first_global_settlement_cycle(uuid[], uuid[], numeric[]) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.first_global_settlement_cycle(uuid[], uuid[], numeric[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.first_global_settlement_cycle(uuid[], uuid[], numeric[]) TO nobroke_executor;

CREATE FUNCTION private.first_global_settlement_path(p_debtors uuid[], p_creditors uuid[], p_amounts numeric[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  WITH RECURSIVE edges(edge_no, debtor_id, creditor_id, amount) AS (
    SELECT i, p_debtors[i], p_creditors[i], p_amounts[i]
    FROM pg_catalog.generate_subscripts(p_debtors, 1) AS i
    WHERE p_amounts[i] > 0
  ), vertices(user_id) AS (
    SELECT d FROM pg_catalog.unnest(p_debtors) AS d
    UNION
    SELECT c FROM pg_catalog.unnest(p_creditors) AS c
  ), balances AS (
    SELECT v.user_id,
      COALESCE(pg_catalog.sum(e.amount) FILTER (WHERE e.debtor_id = v.user_id), 0)
       - COALESCE(pg_catalog.sum(e.amount) FILTER (WHERE e.creditor_id = v.user_id), 0) AS net_due
    FROM vertices v LEFT JOIN edges e
      ON e.debtor_id = v.user_id OR e.creditor_id = v.user_id
    GROUP BY v.user_id
  ), walk(start_id, current_id, user_path, edge_path) AS (
    SELECT b.user_id, e.creditor_id, ARRAY[b.user_id, e.creditor_id], ARRAY[e.edge_no]
    FROM balances b JOIN edges e ON e.debtor_id = b.user_id
    WHERE b.net_due > 0
    UNION ALL
    SELECT w.start_id, e.creditor_id, w.user_path || e.creditor_id, w.edge_path || e.edge_no
    FROM walk w JOIN edges e ON e.debtor_id = w.current_id
    WHERE e.amount > 0
      AND pg_catalog.cardinality(w.user_path) < pg_catalog.cardinality(p_debtors) + 1
      AND NOT e.creditor_id = ANY(w.user_path)
  )
  SELECT pg_catalog.jsonb_build_object(
    'source', w.start_id,
    'sink', w.current_id,
    'edge_path', pg_catalog.to_jsonb(w.edge_path),
    'source_amount', source.net_due::numeric(12,2)::text,
    'sink_amount', (-target.net_due)::numeric(12,2)::text
  )
  FROM walk w
  JOIN balances source ON source.user_id = w.start_id AND source.net_due > 0
  JOIN balances target ON target.user_id = w.current_id AND target.net_due < 0
  ORDER BY w.start_id, w.current_id, w.edge_path
  LIMIT 1
$$;
ALTER FUNCTION private.first_global_settlement_path(uuid[], uuid[], numeric[]) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.first_global_settlement_path(uuid[], uuid[], numeric[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.first_global_settlement_path(uuid[], uuid[], numeric[]) TO nobroke_executor;

CREATE FUNCTION private.lock_global_settlement_sources(p_obligation_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app
AS $function$
DECLARE row_id uuid;
BEGIN
  FOR row_id IN
    SELECT DISTINCT o.source_group_id FROM app.obligations o
    WHERE o.obligation_id = ANY(p_obligation_ids) ORDER BY o.source_group_id
  LOOP
    PERFORM 1 FROM app.expense_groups g WHERE g.group_id = row_id FOR UPDATE;
  END LOOP;
  FOR row_id IN
    SELECT DISTINCT o.source_expense_id FROM app.obligations o
    WHERE o.obligation_id = ANY(p_obligation_ids) ORDER BY o.source_expense_id
  LOOP
    PERFORM 1 FROM app.expenses e WHERE e.expense_id = row_id FOR UPDATE;
  END LOOP;
  FOR row_id IN
    SELECT o.obligation_id FROM app.obligations o
    WHERE o.obligation_id = ANY(p_obligation_ids) ORDER BY o.obligation_id
  LOOP
    PERFORM 1 FROM app.obligations o WHERE o.obligation_id = row_id FOR UPDATE;
  END LOOP;
END
$function$;
ALTER FUNCTION private.lock_global_settlement_sources(uuid[]) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.lock_global_settlement_sources(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.lock_global_settlement_sources(uuid[]) TO nobroke_executor;

CREATE FUNCTION private.get_global_settlement_plan(p_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid(); plan_row app.global_settlement_plans%ROWTYPE;
  result jsonb;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO plan_row FROM app.global_settlement_plans p WHERE p.plan_id = p_plan_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM app.global_settlement_participants p
    WHERE p.plan_id = p_plan_id AND p.user_id = caller_id) THEN
    RAISE EXCEPTION 'global_settlement_not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'plan_id', plan_row.plan_id,
    'created_by', plan_row.created_by,
    'can_accept', plan_row.created_by = caller_id,
    'status', plan_row.status,
    'created_at', plan_row.created_at::text,
    'expires_at', plan_row.expires_at::text,
    'accepted_at', plan_row.accepted_at::text,
    'completed_at', plan_row.completed_at::text,
    'participants', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', part.user_id, 'username', profile.username, 'display_name', profile.display_name
      ) ORDER BY part.user_id)
      FROM app.global_settlement_participants part
      JOIN app.profiles profile ON profile.user_id = part.user_id
      WHERE part.plan_id = p_plan_id
    ), '[]'::jsonb),
    'transfers', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'transfer_id', t.transfer_id,
        'transfer_order', t.transfer_order,
        'debtor_user_id', t.debtor_user_id,
        'debtor_name', debtor.display_name,
        'creditor_user_id', t.creditor_user_id,
        'creditor_name', creditor.display_name,
        'amount', t.amount::text,
        'source_friendships_active', NOT EXISTS (
          SELECT 1 FROM app.global_settlement_allocations source_allocation
          JOIN app.obligations source_obligation ON source_obligation.obligation_id = source_allocation.obligation_id
          WHERE source_allocation.transfer_id = t.transfer_id
            AND NOT EXISTS (SELECT 1 FROM app.friendships f
              WHERE f.user_a = LEAST(source_obligation.debtor_user_id, source_obligation.creditor_user_id)
                AND f.user_b = GREATEST(source_obligation.debtor_user_id, source_obligation.creditor_user_id)
                AND f.status = 'ACTIVE')
        ),
        'status', t.status,
        'reported_at', t.reported_at::text,
        'resolved_at', t.resolved_at::text,
        'allocations', COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'allocation_id', a.allocation_id,
            'obligation_id', a.obligation_id,
            'group_id', a.source_group_id,
            'group_name', g.group_name,
            'expense_id', a.source_expense_id,
            'expense_title', e.title,
            'debtor_user_id', o.debtor_user_id,
            'creditor_user_id', o.creditor_user_id,
            'kind', a.allocation_kind,
            'amount', a.amount::text
          ) ORDER BY a.allocation_id)
          FROM app.global_settlement_allocations a
          JOIN app.obligations o ON o.obligation_id = a.obligation_id
          JOIN app.expense_groups g ON g.group_id = a.source_group_id
          JOIN app.expenses e ON e.expense_id = a.source_expense_id
          WHERE a.transfer_id = t.transfer_id
        ), '[]'::jsonb)
      ) ORDER BY t.transfer_order)
      FROM app.global_settlement_transfers t
      JOIN app.profiles debtor ON debtor.user_id = t.debtor_user_id
      JOIN app.profiles creditor ON creditor.user_id = t.creditor_user_id
      WHERE t.plan_id = p_plan_id AND (
        caller_id IN (t.debtor_user_id, t.creditor_user_id)
        OR EXISTS (SELECT 1 FROM app.global_settlement_allocations a
          JOIN app.obligations o ON o.obligation_id = a.obligation_id
          WHERE a.transfer_id = t.transfer_id
            AND caller_id IN (o.debtor_user_id, o.creditor_user_id))
      )
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END
$function$;
ALTER FUNCTION private.get_global_settlement_plan(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.get_global_settlement_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_global_settlement_plan(uuid) TO authenticated, nobroke_executor;

CREATE FUNCTION private.create_global_settlement_preview(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private, extensions
AS $function$
DECLARE caller_id uuid := auth.uid(); request_hash bytea; plan_row app.global_settlement_plans%ROWTYPE;
  initial_snapshot jsonb; snapshot jsonb; source_ids uuid[]; participant_ids uuid[];
  debtors uuid[]; creditors uuid[]; amounts numeric[]; sources jsonb[];
  source_rows jsonb; version_data jsonb; transfer_rows jsonb := '[]'::jsonb;
  allocation_rows jsonb := '[]'::jsonb; cycle_allocations jsonb := '[]'::jsonb;
  cycle_edges integer[]; path_result jsonb; path_edges integer[]; path_amount numeric;
  edge_no integer; source_data jsonb; allocations_result jsonb; allocation jsonb;
  transfer_id uuid; transfer_order integer := 0; expires timestamptz;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'invalid_request_id' USING ERRCODE = 'P0001'; END IF;
  PERFORM private.lock_financial_writes();
  request_hash := extensions.digest(pg_catalog.convert_to(caller_id::text || ':global-settlement-v1', 'UTF8'), 'sha256');
  SELECT * INTO plan_row FROM app.global_settlement_plans p
    WHERE p.created_by = caller_id AND p.request_id = p_request_id;
  IF FOUND THEN
    IF plan_row.request_hash <> request_hash THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001'; END IF;
    RETURN private.get_global_settlement_plan(plan_row.plan_id);
  END IF;
  IF NOT COALESCE((SELECT p.enabled FROM app.global_netting_preferences p
    WHERE p.user_id = caller_id), true) THEN
    RAISE EXCEPTION 'global_netting_disabled' USING ERRCODE = 'P0001';
  END IF;

  initial_snapshot := private.global_settlement_candidate_snapshot(caller_id);
  SELECT pg_catalog.array_agg((item ->> 'obligation_id')::uuid ORDER BY (item ->> 'obligation_id')::uuid)
    INTO source_ids FROM pg_catalog.jsonb_array_elements(initial_snapshot -> 'obligations') AS rows(item);
  IF COALESCE(pg_catalog.cardinality(source_ids), 0) = 0 THEN
    RAISE EXCEPTION 'global_settlement_no_eligible_debts' USING ERRCODE = 'P0001';
  END IF;
  IF pg_catalog.cardinality(source_ids) > 250 THEN
    RAISE EXCEPTION 'global_settlement_too_large' USING ERRCODE = 'P0001';
  END IF;
  SELECT pg_catalog.array_agg(value::uuid ORDER BY value::uuid) INTO participant_ids
    FROM pg_catalog.jsonb_array_elements_text(initial_snapshot -> 'users') AS users(value);
  IF pg_catalog.cardinality(participant_ids) > 50 THEN
    RAISE EXCEPTION 'global_settlement_too_large' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.lock_global_settlement_sources(source_ids);
  snapshot := private.global_settlement_candidate_snapshot(caller_id);
  IF snapshot -> 'obligations' IS DISTINCT FROM initial_snapshot -> 'obligations'
      OR snapshot -> 'users' IS DISTINCT FROM initial_snapshot -> 'users' THEN
    RAISE EXCEPTION 'stale_global_settlement_preview' USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.array_agg(edge.debtor_id ORDER BY edge.debtor_id, edge.creditor_id),
    pg_catalog.array_agg(edge.creditor_id ORDER BY edge.debtor_id, edge.creditor_id),
    pg_catalog.array_agg(edge.amount ORDER BY edge.debtor_id, edge.creditor_id),
    pg_catalog.array_agg(edge.sources ORDER BY edge.debtor_id, edge.creditor_id)
  INTO debtors, creditors, amounts, sources
  FROM (
    SELECT (item ->> 'debtor_user_id')::uuid AS debtor_id,
      (item ->> 'creditor_user_id')::uuid AS creditor_id,
      pg_catalog.sum((item ->> 'remaining_amount')::numeric)::numeric(12,2) AS amount,
      pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'obligation_id', item ->> 'obligation_id',
        'source_group_id', item ->> 'source_group_id',
        'source_expense_id', item ->> 'source_expense_id',
        'remaining_amount', item ->> 'remaining_amount'
      ) ORDER BY (item ->> 'obligation_id')::uuid) AS sources
    FROM pg_catalog.jsonb_array_elements(snapshot -> 'obligations') AS rows(item)
    GROUP BY (item ->> 'debtor_user_id')::uuid, (item ->> 'creditor_user_id')::uuid
  ) edge;

  WHILE true LOOP
    cycle_edges := private.first_global_settlement_cycle(debtors, creditors, amounts);
    IF cycle_edges IS NULL THEN EXIT; END IF;
    SELECT pg_catalog.min(amounts[i]) INTO path_amount FROM pg_catalog.unnest(cycle_edges) AS edge(i);
    FOR edge_no IN SELECT i FROM pg_catalog.unnest(cycle_edges) AS edge(i) LOOP
      allocations_result := private.take_global_edge_allocation(sources[edge_no], path_amount);
      FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(allocations_result -> 'allocations') LOOP
        cycle_allocations := cycle_allocations || pg_catalog.jsonb_build_array(
          allocation || pg_catalog.jsonb_build_object('allocation_kind', 'CYCLE_CLEAR'));
      END LOOP;
      sources[edge_no] := allocations_result -> 'sources';
      amounts[edge_no] := amounts[edge_no] - path_amount;
    END LOOP;
  END LOOP;

  WHILE true LOOP
    path_result := private.first_global_settlement_path(debtors, creditors, amounts);
    IF path_result IS NULL THEN EXIT; END IF;
    SELECT pg_catalog.array_agg(value::integer ORDER BY ordinality) INTO path_edges
      FROM pg_catalog.jsonb_array_elements_text(path_result -> 'edge_path') WITH ORDINALITY AS edge(value, ordinality);
    SELECT LEAST((path_result ->> 'source_amount')::numeric,
      (path_result ->> 'sink_amount')::numeric, pg_catalog.min(amounts[i]))
      INTO path_amount FROM pg_catalog.unnest(path_edges) AS edge(i);
    transfer_order := transfer_order + 1;
    transfer_id := pg_catalog.gen_random_uuid();
    transfer_rows := transfer_rows || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'transfer_id', transfer_id, 'transfer_order', transfer_order,
      'debtor_user_id', path_result ->> 'source', 'creditor_user_id', path_result ->> 'sink',
      'amount', path_amount::numeric(12,2)::text
    ));
    FOR edge_no IN SELECT i FROM pg_catalog.unnest(path_edges) AS edge(i) LOOP
      allocations_result := private.take_global_edge_allocation(sources[edge_no], path_amount);
      FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(allocations_result -> 'allocations') LOOP
        allocation_rows := allocation_rows || pg_catalog.jsonb_build_array(
          allocation || pg_catalog.jsonb_build_object(
            'transfer_id', transfer_id, 'allocation_kind', 'PATH_CLEAR'));
      END LOOP;
      sources[edge_no] := allocations_result -> 'sources';
      amounts[edge_no] := amounts[edge_no] - path_amount;
    END LOOP;
  END LOOP;

  IF pg_catalog.jsonb_array_length(transfer_rows) = 0 THEN
    RAISE EXCEPTION 'global_settlement_no_payment_required' USING ERRCODE = 'P0001';
  END IF;
  IF pg_catalog.jsonb_array_length(cycle_allocations) > 0 THEN
    transfer_id := (transfer_rows -> 0 ->> 'transfer_id')::uuid;
    FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(cycle_allocations) LOOP
      allocation_rows := allocation_rows || pg_catalog.jsonb_build_array(
        allocation || pg_catalog.jsonb_build_object('transfer_id', transfer_id));
    END LOOP;
  END IF;

  SELECT pg_catalog.jsonb_object_agg(item ->> 'obligation_id', pg_catalog.jsonb_build_object(
    'version_no', item ->> 'version_no', 'remaining_amount', item ->> 'remaining_amount'
  )) INTO version_data
  FROM pg_catalog.jsonb_array_elements(snapshot -> 'obligations') AS rows(item);
  expires := pg_catalog.clock_timestamp() + interval '5 minutes';
  INSERT INTO app.global_settlement_plans(
    created_by, request_id, request_hash, status, participant_ids,
    source_obligation_ids, version_snapshot, expires_at
  ) VALUES (
    caller_id, p_request_id, request_hash, 'PREVIEW', participant_ids,
    source_ids, COALESCE(version_data, '{}'::jsonb), expires
  ) RETURNING * INTO plan_row;
  INSERT INTO app.global_settlement_participants(plan_id, user_id, participant_role)
  SELECT plan_row.plan_id, user_id, CASE WHEN user_id = caller_id THEN 'CREATOR' ELSE 'INVOLVED' END
  FROM pg_catalog.unnest(participant_ids) AS users(user_id);
  INSERT INTO app.global_settlement_transfers(
    transfer_id, plan_id, transfer_order, debtor_user_id, creditor_user_id, amount, status
  )
  SELECT (item ->> 'transfer_id')::uuid, plan_row.plan_id,
    (item ->> 'transfer_order')::integer, (item ->> 'debtor_user_id')::uuid,
    (item ->> 'creditor_user_id')::uuid, (item ->> 'amount')::numeric(12,2), 'PLANNED'
  FROM pg_catalog.jsonb_array_elements(transfer_rows) AS rows(item);
  INSERT INTO app.global_settlement_allocations(
    transfer_id, obligation_id, source_group_id, source_expense_id, allocation_kind, amount
  )
  SELECT (item ->> 'transfer_id')::uuid, (item ->> 'obligation_id')::uuid,
    (item ->> 'source_group_id')::uuid, (item ->> 'source_expense_id')::uuid,
    item ->> 'allocation_kind', (item ->> 'amount')::numeric(12,2)
  FROM pg_catalog.jsonb_array_elements(allocation_rows) AS rows(item);
  INSERT INTO app.global_settlement_events(plan_id, event_type, actor_user_id)
  VALUES (plan_row.plan_id, 'PREVIEWED', caller_id);
  RETURN private.get_global_settlement_plan(plan_row.plan_id);
END
$function$;
ALTER FUNCTION private.create_global_settlement_preview(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.create_global_settlement_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_global_settlement_preview(uuid) TO authenticated;

CREATE FUNCTION api.preview_global_settlement(p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.create_global_settlement_preview(p_request_id)
$$;
ALTER FUNCTION api.preview_global_settlement(uuid) SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION api.preview_global_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.preview_global_settlement(uuid) TO authenticated;

CREATE FUNCTION private.accept_global_settlement_plan(p_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); plan_row app.global_settlement_plans%ROWTYPE;
  source_ids uuid[]; participant_ids uuid[]; snapshot jsonb; fresh_source_ids uuid[]; fresh_participants uuid[];
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  PERFORM private.lock_financial_writes();
  SELECT * INTO plan_row FROM app.global_settlement_plans p WHERE p.plan_id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'global_settlement_not_found' USING ERRCODE = 'P0001'; END IF;
  IF plan_row.created_by <> caller_id THEN RAISE EXCEPTION 'global_settlement_creator_required' USING ERRCODE = 'P0001'; END IF;
  IF plan_row.status IN ('ACCEPTED', 'PARTIAL', 'COMPLETED') THEN
    RETURN private.get_global_settlement_plan(p_plan_id);
  END IF;
  IF plan_row.status <> 'PREVIEW' THEN RAISE EXCEPTION 'global_settlement_plan_unavailable' USING ERRCODE = 'P0001'; END IF;
  IF plan_row.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'stale_global_settlement_preview' USING ERRCODE = 'P0001';
  END IF;

  source_ids := plan_row.source_obligation_ids;
  PERFORM private.lock_global_settlement_sources(source_ids);
  SELECT * INTO plan_row FROM app.global_settlement_plans p WHERE p.plan_id = p_plan_id FOR UPDATE;
  IF plan_row.status <> 'PREVIEW' OR plan_row.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'stale_global_settlement_preview' USING ERRCODE = 'P0001';
  END IF;
  snapshot := private.global_settlement_candidate_snapshot(plan_row.created_by);
  SELECT pg_catalog.array_agg((item ->> 'obligation_id')::uuid ORDER BY (item ->> 'obligation_id')::uuid)
    INTO fresh_source_ids FROM pg_catalog.jsonb_array_elements(snapshot -> 'obligations') AS rows(item);
  SELECT pg_catalog.array_agg(value::uuid ORDER BY value::uuid) INTO fresh_participants
    FROM pg_catalog.jsonb_array_elements_text(snapshot -> 'users') AS users(value);
  IF fresh_source_ids IS DISTINCT FROM plan_row.source_obligation_ids
      OR fresh_participants IS DISTINCT FROM plan_row.participant_ids
      OR EXISTS (SELECT 1 FROM pg_catalog.unnest(plan_row.participant_ids) AS users(user_id)
        WHERE NOT COALESCE((SELECT pref.enabled FROM app.global_netting_preferences pref
          WHERE pref.user_id = users.user_id), true))
      OR EXISTS (SELECT 1 FROM pg_catalog.unnest(plan_row.source_obligation_ids) AS ids(obligation_id)
        LEFT JOIN app.obligations o ON o.obligation_id = ids.obligation_id
        WHERE o.obligation_id IS NULL OR o.status NOT IN ('OPEN', 'PARTIAL')
          OR o.remaining_amount <> (plan_row.version_snapshot -> o.obligation_id::text ->> 'remaining_amount')::numeric
          OR o.version_no <> (plan_row.version_snapshot -> o.obligation_id::text ->> 'version_no')::bigint
          OR private.obligation_reserved_amount(o.obligation_id) <> 0)
      OR EXISTS (SELECT 1 FROM app.global_settlement_transfers t
        WHERE t.plan_id = p_plan_id AND t.status <> 'PLANNED') THEN
    RAISE EXCEPTION 'stale_global_settlement_preview' USING ERRCODE = 'P0001';
  END IF;
  UPDATE app.global_settlement_transfers SET status = 'ACCEPTED'
    WHERE plan_id = p_plan_id AND status = 'PLANNED';
  UPDATE app.global_settlement_plans SET status = 'ACCEPTED', accepted_at = pg_catalog.clock_timestamp()
    WHERE plan_id = p_plan_id;
  INSERT INTO app.global_settlement_events(plan_id, event_type, actor_user_id)
  VALUES (p_plan_id, 'ACCEPTED', caller_id);
  RETURN private.get_global_settlement_plan(p_plan_id);
END
$function$;
ALTER FUNCTION private.accept_global_settlement_plan(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.accept_global_settlement_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.accept_global_settlement_plan(uuid) TO authenticated;

CREATE FUNCTION private.refresh_global_settlement_plan(p_plan_id uuid, p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app
AS $function$
DECLARE next_status text; current_status text;
BEGIN
  SELECT status INTO current_status FROM app.global_settlement_plans WHERE plan_id = p_plan_id;
  IF NOT EXISTS (SELECT 1 FROM app.global_settlement_transfers t
    WHERE t.plan_id = p_plan_id AND t.status <> 'CONFIRMED') THEN
    next_status := 'COMPLETED';
  ELSIF NOT EXISTS (SELECT 1 FROM app.global_settlement_transfers t
      WHERE t.plan_id = p_plan_id AND t.status IN ('PLANNED', 'ACCEPTED', 'PENDING')) THEN
    IF EXISTS (SELECT 1 FROM app.global_settlement_transfers t
      WHERE t.plan_id = p_plan_id AND t.status = 'CONFIRMED') THEN next_status := 'PARTIAL';
    ELSE next_status := 'CANCELLED'; END IF;
  ELSIF EXISTS (SELECT 1 FROM app.global_settlement_transfers t
      WHERE t.plan_id = p_plan_id AND t.status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')) THEN
    next_status := 'PARTIAL';
  ELSE
    next_status := 'ACCEPTED';
  END IF;
  UPDATE app.global_settlement_plans SET status = next_status,
    completed_at = CASE WHEN next_status = 'COMPLETED' THEN pg_catalog.clock_timestamp() ELSE completed_at END
  WHERE plan_id = p_plan_id AND status IS DISTINCT FROM next_status;
  IF current_status IS DISTINCT FROM next_status AND next_status = 'COMPLETED' THEN
    INSERT INTO app.global_settlement_events(plan_id, event_type, actor_user_id)
    VALUES (p_plan_id, 'PLAN_COMPLETED', p_actor_id);
  END IF;
END
$function$;
ALTER FUNCTION private.refresh_global_settlement_plan(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.refresh_global_settlement_plan(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.refresh_global_settlement_plan(uuid, uuid) TO nobroke_executor;

CREATE FUNCTION private.report_global_settlement_transfer(p_transfer_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); transfer_row app.global_settlement_transfers%ROWTYPE;
  plan_row app.global_settlement_plans%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'invalid_request_id' USING ERRCODE = 'P0001'; END IF;
  PERFORM private.lock_financial_writes();
  SELECT * INTO transfer_row FROM app.global_settlement_transfers t WHERE t.transfer_id = p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'global_settlement_transfer_not_found' USING ERRCODE = 'P0001'; END IF;
  PERFORM private.lock_global_settlement_sources((
    SELECT p.source_obligation_ids FROM app.global_settlement_plans p WHERE p.plan_id = transfer_row.plan_id));
  SELECT * INTO plan_row FROM app.global_settlement_plans p WHERE p.plan_id = transfer_row.plan_id FOR UPDATE;
  SELECT * INTO transfer_row FROM app.global_settlement_transfers t WHERE t.transfer_id = p_transfer_id FOR UPDATE;
  IF caller_id <> transfer_row.debtor_user_id THEN RAISE EXCEPTION 'debtor_required' USING ERRCODE = 'P0001'; END IF;
  IF transfer_row.status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED') THEN
    IF transfer_row.report_request_id = p_request_id THEN
      RETURN private.get_global_settlement_plan(plan_row.plan_id);
    END IF;
    RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
  END IF;
  IF transfer_row.status <> 'ACCEPTED' OR plan_row.status NOT IN ('ACCEPTED', 'PARTIAL') THEN
    RAISE EXCEPTION 'global_settlement_transfer_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM app.global_settlement_allocations a
    JOIN app.obligations o ON o.obligation_id = a.obligation_id
    WHERE a.transfer_id = p_transfer_id
      AND NOT EXISTS (SELECT 1 FROM app.friendships f
        WHERE f.user_a = LEAST(o.debtor_user_id, o.creditor_user_id)
          AND f.user_b = GREATEST(o.debtor_user_id, o.creditor_user_id)
          AND f.status = 'ACTIVE')
  ) THEN RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001'; END IF;
  UPDATE app.global_settlement_transfers SET status = 'PENDING', report_request_id = p_request_id,
    reported_at = pg_catalog.clock_timestamp()
  WHERE transfer_id = p_transfer_id;
  UPDATE app.global_settlement_plans SET status = 'PARTIAL' WHERE plan_id = plan_row.plan_id;
  INSERT INTO app.global_settlement_events(plan_id, transfer_id, event_type, actor_user_id, amount)
  VALUES (plan_row.plan_id, p_transfer_id, 'PAYMENT_REPORTED', caller_id, transfer_row.amount);
  RETURN private.get_global_settlement_plan(plan_row.plan_id);
END
$function$;
ALTER FUNCTION private.report_global_settlement_transfer(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.report_global_settlement_transfer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.report_global_settlement_transfer(uuid, uuid) TO authenticated;

CREATE FUNCTION private.resolve_global_settlement_transfer(p_transfer_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); transfer_row app.global_settlement_transfers%ROWTYPE;
  plan_row app.global_settlement_plans%ROWTYPE; next_status text;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_action NOT IN ('CONFIRM', 'REJECT', 'CANCEL') THEN RAISE EXCEPTION 'invalid_action' USING ERRCODE = 'P0001'; END IF;
  PERFORM private.lock_financial_writes();
  SELECT * INTO transfer_row FROM app.global_settlement_transfers t WHERE t.transfer_id = p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'global_settlement_transfer_not_found' USING ERRCODE = 'P0001'; END IF;
  PERFORM private.lock_global_settlement_sources((
    SELECT p.source_obligation_ids FROM app.global_settlement_plans p WHERE p.plan_id = transfer_row.plan_id));
  SELECT * INTO plan_row FROM app.global_settlement_plans p WHERE p.plan_id = transfer_row.plan_id FOR UPDATE;
  SELECT * INTO transfer_row FROM app.global_settlement_transfers t WHERE t.transfer_id = p_transfer_id FOR UPDATE;
  IF (p_action IN ('CONFIRM', 'REJECT') AND caller_id <> transfer_row.creditor_user_id)
      OR (p_action = 'CANCEL' AND caller_id <> transfer_row.debtor_user_id) THEN
    IF p_action = 'CANCEL' THEN RAISE EXCEPTION 'debtor_required' USING ERRCODE = 'P0001';
    ELSE RAISE EXCEPTION 'creditor_required' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF (p_action = 'CONFIRM' AND transfer_row.status = 'CONFIRMED')
      OR (p_action = 'REJECT' AND transfer_row.status = 'REJECTED')
      OR (p_action = 'CANCEL' AND transfer_row.status = 'CANCELLED') THEN
    RETURN private.get_global_settlement_plan(plan_row.plan_id);
  END IF;
  IF (p_action IN ('CONFIRM', 'REJECT') AND transfer_row.status <> 'PENDING')
      OR (p_action = 'CANCEL' AND transfer_row.status NOT IN ('ACCEPTED', 'PENDING')) THEN
    RAISE EXCEPTION 'global_settlement_transfer_unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'CONFIRM' THEN
    IF EXISTS (
      SELECT 1 FROM app.global_settlement_allocations a
      JOIN app.obligations o ON o.obligation_id = a.obligation_id
      WHERE a.transfer_id = p_transfer_id
        AND NOT EXISTS (SELECT 1 FROM app.friendships f
          WHERE f.user_a = LEAST(o.debtor_user_id, o.creditor_user_id)
            AND f.user_b = GREATEST(o.debtor_user_id, o.creditor_user_id)
            AND f.status = 'ACTIVE')
    ) THEN RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (
      SELECT 1 FROM app.global_settlement_allocations a
      JOIN app.obligations o ON o.obligation_id = a.obligation_id
      WHERE a.transfer_id = p_transfer_id
      GROUP BY o.obligation_id, o.remaining_amount
      HAVING pg_catalog.sum(a.amount) > o.remaining_amount
    ) THEN RAISE EXCEPTION 'stale_global_settlement_plan' USING ERRCODE = 'P0001'; END IF;
    UPDATE app.obligations o SET remaining_amount = o.remaining_amount - used.amount,
      status = CASE WHEN o.remaining_amount - used.amount = 0 THEN 'SETTLED' ELSE 'PARTIAL' END
    FROM (SELECT a.obligation_id, pg_catalog.sum(a.amount)::numeric(12,2) AS amount
      FROM app.global_settlement_allocations a WHERE a.transfer_id = p_transfer_id
      GROUP BY a.obligation_id) used
    WHERE o.obligation_id = used.obligation_id;
    INSERT INTO app.settlement_records(
      obligation_id, global_transfer_id, settlement_type, amount, from_user_id, to_user_id
    )
    SELECT a.obligation_id, p_transfer_id,
      CASE WHEN a.allocation_kind = 'PATH_CLEAR' THEN 'GLOBAL_PAYMENT' ELSE 'GLOBAL_NET' END,
      a.amount, o.debtor_user_id, o.creditor_user_id
    FROM app.global_settlement_allocations a
    JOIN app.obligations o ON o.obligation_id = a.obligation_id
    WHERE a.transfer_id = p_transfer_id;
    INSERT INTO app.obligation_events(obligation_id, event_type, actor_user_id, amount, related_id)
    SELECT a.obligation_id, 'GLOBAL_SETTLEMENT', caller_id, a.amount, p_transfer_id
    FROM app.global_settlement_allocations a WHERE a.transfer_id = p_transfer_id;
    next_status := 'CONFIRMED';
  ELSIF p_action = 'REJECT' THEN next_status := 'REJECTED';
  ELSE next_status := 'CANCELLED';
  END IF;

  UPDATE app.global_settlement_transfers SET status = next_status,
    resolved_at = pg_catalog.clock_timestamp(), resolved_by = caller_id
  WHERE transfer_id = p_transfer_id;
  INSERT INTO app.global_settlement_events(plan_id, transfer_id, event_type, actor_user_id, amount)
  VALUES (plan_row.plan_id, p_transfer_id,
    CASE p_action WHEN 'CONFIRM' THEN 'PAYMENT_CONFIRMED'
      WHEN 'REJECT' THEN 'PAYMENT_REJECTED' ELSE 'PAYMENT_CANCELLED' END,
    caller_id, transfer_row.amount);
  IF p_action = 'CONFIRM' THEN
    PERFORM private.enqueue_notification(transfer_row.debtor_user_id, 'CASCADES',
      'GLOBAL_PAYMENT_CONFIRMED', 'Payment confirmed',
      'The recipient confirmed your global settlement payment.',
      'global-payment-confirmed:' || p_transfer_id::text || ':debtor');
    PERFORM private.enqueue_notification(transfer_row.creditor_user_id, 'CASCADES',
      'GLOBAL_PAYMENT_CONFIRMED', 'Payment recorded',
      'Your confirmation settled the linked friend balances.',
      'global-payment-confirmed:' || p_transfer_id::text || ':creditor');
  END IF;
  PERFORM private.refresh_global_settlement_plan(plan_row.plan_id, caller_id);
  RETURN private.get_global_settlement_plan(plan_row.plan_id);
END
$function$;
ALTER FUNCTION private.resolve_global_settlement_transfer(uuid, text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.resolve_global_settlement_transfer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.resolve_global_settlement_transfer(uuid, text) TO authenticated;

CREATE FUNCTION api.accept_global_settlement_plan(p_plan_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.accept_global_settlement_plan(p_plan_id)
$$;
CREATE FUNCTION api.report_global_settlement_transfer(p_transfer_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.report_global_settlement_transfer(p_transfer_id, p_request_id)
$$;
CREATE FUNCTION api.confirm_global_settlement_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.resolve_global_settlement_transfer(p_transfer_id, 'CONFIRM')
$$;
CREATE FUNCTION api.reject_global_settlement_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.resolve_global_settlement_transfer(p_transfer_id, 'REJECT')
$$;
CREATE FUNCTION api.cancel_global_settlement_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.resolve_global_settlement_transfer(p_transfer_id, 'CANCEL')
$$;
ALTER FUNCTION api.accept_global_settlement_plan(uuid) SET search_path = pg_catalog;
ALTER FUNCTION api.report_global_settlement_transfer(uuid, uuid) SET search_path = pg_catalog;
ALTER FUNCTION api.confirm_global_settlement_transfer(uuid) SET search_path = pg_catalog;
ALTER FUNCTION api.reject_global_settlement_transfer(uuid) SET search_path = pg_catalog;
ALTER FUNCTION api.cancel_global_settlement_transfer(uuid) SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION api.accept_global_settlement_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.report_global_settlement_transfer(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.confirm_global_settlement_transfer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.reject_global_settlement_transfer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.cancel_global_settlement_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.accept_global_settlement_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.report_global_settlement_transfer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.confirm_global_settlement_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.reject_global_settlement_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.cancel_global_settlement_transfer(uuid) TO authenticated;

CREATE FUNCTION private.list_global_settlement_plans(
  p_after_created_at timestamptz DEFAULT NULL, p_after_plan_id uuid DEFAULT NULL, p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); result jsonb;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(private.get_global_settlement_plan(page.plan_id)
    ORDER BY page.created_at DESC, page.plan_id DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT p.plan_id, p.created_at
    FROM app.global_settlement_plans p
    JOIN app.global_settlement_participants participant ON participant.plan_id = p.plan_id
      AND participant.user_id = caller_id
    WHERE p_after_created_at IS NULL OR (p.created_at, p.plan_id) < (p_after_created_at, p_after_plan_id)
    ORDER BY p.created_at DESC, p.plan_id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) page;
  RETURN result;
END
$function$;
ALTER FUNCTION private.list_global_settlement_plans(timestamptz, uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_global_settlement_plans(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_global_settlement_plans(timestamptz, uuid, integer) TO authenticated;

CREATE FUNCTION private.list_global_settlement_history(
  p_after_created_at timestamptz DEFAULT NULL, p_after_transfer_id uuid DEFAULT NULL, p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid(); result jsonb;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'transfer_id', page.transfer_id,
    'plan_id', page.plan_id,
    'plan_status', page.plan_status,
    'transfer_order', page.transfer_order,
    'debtor_user_id', page.debtor_user_id,
    'debtor_name', page.debtor_name,
    'creditor_user_id', page.creditor_user_id,
    'creditor_name', page.creditor_name,
    'amount', page.amount::text,
    'status', page.status,
    'created_at', page.created_at::text,
    'reported_at', page.reported_at::text,
    'resolved_at', page.resolved_at::text,
    'allocations', page.allocations
  ) ORDER BY page.created_at DESC, page.transfer_id DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT t.transfer_id, t.plan_id, p.status AS plan_status, t.transfer_order,
      t.debtor_user_id, debtor.display_name AS debtor_name,
      t.creditor_user_id, creditor.display_name AS creditor_name,
      t.amount, t.status, t.created_at, t.reported_at, t.resolved_at,
      (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'allocation_id', a.allocation_id, 'obligation_id', a.obligation_id,
        'group_id', a.source_group_id, 'group_name', g.group_name,
        'expense_id', a.source_expense_id, 'expense_title', e.title,
        'debtor_user_id', o.debtor_user_id, 'creditor_user_id', o.creditor_user_id,
        'kind', a.allocation_kind, 'amount', a.amount::text
      ) ORDER BY a.allocation_id), '[]'::jsonb)
       FROM app.global_settlement_allocations a
       JOIN app.obligations o ON o.obligation_id = a.obligation_id
       JOIN app.expense_groups g ON g.group_id = a.source_group_id
       JOIN app.expenses e ON e.expense_id = a.source_expense_id
       WHERE a.transfer_id = t.transfer_id) AS allocations
    FROM app.global_settlement_transfers t
    JOIN app.global_settlement_plans p ON p.plan_id = t.plan_id
    JOIN app.profiles debtor ON debtor.user_id = t.debtor_user_id
    JOIN app.profiles creditor ON creditor.user_id = t.creditor_user_id
    WHERE EXISTS (SELECT 1 FROM app.global_settlement_participants participant
      WHERE participant.plan_id = p.plan_id AND participant.user_id = caller_id)
      AND (caller_id IN (t.debtor_user_id, t.creditor_user_id)
        OR EXISTS (SELECT 1 FROM app.global_settlement_allocations a
          JOIN app.obligations o ON o.obligation_id = a.obligation_id
          WHERE a.transfer_id = t.transfer_id
            AND caller_id IN (o.debtor_user_id, o.creditor_user_id)))
      AND (p_after_created_at IS NULL OR (t.created_at, t.transfer_id) < (p_after_created_at, p_after_transfer_id))
    ORDER BY t.created_at DESC, t.transfer_id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) page;
  RETURN result;
END
$function$;
ALTER FUNCTION private.list_global_settlement_history(timestamptz, uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_global_settlement_history(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_global_settlement_history(timestamptz, uuid, integer) TO authenticated;

CREATE FUNCTION api.get_global_settlement_plan(p_plan_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.get_global_settlement_plan(p_plan_id)
$$;
CREATE FUNCTION api.list_global_settlement_plans(
  p_after_created_at timestamptz DEFAULT NULL, p_after_plan_id uuid DEFAULT NULL, p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.list_global_settlement_plans(p_after_created_at, p_after_plan_id, p_limit)
$$;
CREATE FUNCTION api.list_global_settlement_history(
  p_after_created_at timestamptz DEFAULT NULL, p_after_transfer_id uuid DEFAULT NULL, p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.list_global_settlement_history(p_after_created_at, p_after_transfer_id, p_limit)
$$;
ALTER FUNCTION api.get_global_settlement_plan(uuid) SET search_path = pg_catalog;
ALTER FUNCTION api.list_global_settlement_plans(timestamptz, uuid, integer) SET search_path = pg_catalog;
ALTER FUNCTION api.list_global_settlement_history(timestamptz, uuid, integer) SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION api.get_global_settlement_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.list_global_settlement_plans(timestamptz, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.list_global_settlement_history(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_global_settlement_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.list_global_settlement_plans(timestamptz, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION api.list_global_settlement_history(timestamptz, uuid, integer) TO authenticated;

-- Corrections and friendship blocks must share the financial lock with global
-- settlement actions so an accepted allocation cannot be erased or confirmed
-- against a relationship that was blocked concurrently.
CREATE OR REPLACE FUNCTION private.void_expense_obligations(p_expense_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $function$
DECLARE related_obligations uuid[];
BEGIN
  SELECT COALESCE(pg_catalog.array_agg(o.obligation_id ORDER BY o.obligation_id), ARRAY[]::uuid[])
  INTO related_obligations FROM app.obligations AS o WHERE o.source_expense_id = p_expense_id;
  IF EXISTS (
    SELECT 1 FROM app.obligations AS o WHERE o.obligation_id = ANY(related_obligations)
      AND (o.remaining_amount <> o.original_amount OR o.status <> 'OPEN'
        OR EXISTS (SELECT 1 FROM app.payment_reports AS p WHERE p.obligation_id = o.obligation_id)
        OR EXISTS (SELECT 1 FROM app.settlement_records AS s WHERE s.obligation_id = o.obligation_id)
        OR EXISTS (SELECT 1 FROM app.route_operations AS r WHERE o.obligation_id = ANY(r.source_obligation_ids))
        OR EXISTS (SELECT 1 FROM app.route_operations AS r WHERE r.resulting_obligation_id = o.obligation_id)
        OR private.obligation_reserved_amount(o.obligation_id) > 0)
  ) THEN RAISE EXCEPTION 'expense_correction_forbidden' USING ERRCODE = 'P0001'; END IF;
  UPDATE app.obligations SET status = 'VOIDED', remaining_amount = 0
  WHERE obligation_id = ANY(related_obligations);
  INSERT INTO app.obligation_events(obligation_id, event_type, amount)
  SELECT obligation_id, 'VOIDED', original_amount FROM app.obligations
  WHERE obligation_id = ANY(related_obligations);
END
$function$;
ALTER FUNCTION private.void_expense_obligations(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.void_expense_obligations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.void_expense_obligations(uuid) TO nobroke_executor;

CREATE OR REPLACE FUNCTION private.block_friend(p_friendship_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); friendship_row app.friendships%ROWTYPE;
BEGIN
  PERFORM private.lock_financial_writes();
  SELECT * INTO friendship_row FROM app.friendships WHERE friendship_id = p_friendship_id FOR UPDATE;
  IF NOT FOUND OR caller_id NOT IN (friendship_row.user_a, friendship_row.user_b) THEN
    RAISE EXCEPTION 'friendship_not_found' USING ERRCODE = 'P0001';
  END IF;
  UPDATE app.friendships SET status = 'BLOCKED', blocked_by = caller_id,
    updated_at = pg_catalog.clock_timestamp() WHERE friendship_id = p_friendship_id;
END
$function$;
ALTER FUNCTION private.block_friend(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.block_friend(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.block_friend(uuid) TO authenticated;
