-- Person 3 debt ledger, explicit trust, confirmed external payments, and routing.
-- All money remains INR NUMERIC(12,2); browser-facing RPCs return decimal text.

CREATE TABLE app.friendships (
  friendship_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'DECLINED', 'BLOCKED')),
  blocked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (user_a < user_b),
  CHECK (requested_by IN (user_a, user_b)),
  CHECK ((status = 'BLOCKED') = (blocked_by IS NOT NULL)),
  UNIQUE (user_a, user_b)
);
CREATE INDEX friendships_user_a ON app.friendships(user_a, status, friendship_id);
CREATE INDEX friendships_user_b ON app.friendships(user_b, status, friendship_id);

CREATE TABLE app.obligations (
  obligation_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  debtor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creditor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_group_id uuid NOT NULL REFERENCES app.expense_groups(group_id) ON DELETE RESTRICT,
  source_expense_id uuid NOT NULL REFERENCES app.expenses(expense_id) ON DELETE RESTRICT,
  original_amount numeric(12,2) NOT NULL CHECK (original_amount > 0),
  remaining_amount numeric(12,2) NOT NULL CHECK (remaining_amount >= 0 AND remaining_amount <= original_amount),
  status text NOT NULL CHECK (status IN ('OPEN', 'PARTIAL', 'SETTLED', 'VOIDED')),
  is_routed boolean NOT NULL DEFAULT false,
  trust_grant_id uuid,
  version_no bigint NOT NULL DEFAULT 1 CHECK (version_no > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (debtor_user_id <> creditor_user_id),
  CHECK ((is_routed AND trust_grant_id IS NOT NULL) OR (NOT is_routed AND trust_grant_id IS NULL)),
  CHECK ((status = 'OPEN' AND remaining_amount = original_amount)
      OR (status = 'PARTIAL' AND remaining_amount > 0 AND remaining_amount < original_amount)
      OR (status = 'SETTLED' AND remaining_amount = 0)
      OR (status = 'VOIDED' AND remaining_amount = 0)),
  UNIQUE (source_expense_id, debtor_user_id, creditor_user_id, is_routed, trust_grant_id)
);
CREATE INDEX obligations_debtor_open ON app.obligations(debtor_user_id, obligation_id)
  WHERE status IN ('OPEN', 'PARTIAL');
CREATE INDEX obligations_creditor_open ON app.obligations(creditor_user_id, obligation_id)
  WHERE status IN ('OPEN', 'PARTIAL');
CREATE INDEX obligations_group_open ON app.obligations(source_group_id, obligation_id)
  WHERE status IN ('OPEN', 'PARTIAL');
CREATE INDEX obligations_source_expense ON app.obligations(source_expense_id, obligation_id);

CREATE TABLE app.trust_grants (
  trust_grant_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  creditor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  debtor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  limit_amount numeric(12,2) NOT NULL CHECK (limit_amount >= 0),
  version_no bigint NOT NULL DEFAULT 1 CHECK (version_no > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (creditor_user_id <> debtor_user_id),
  UNIQUE (creditor_user_id, debtor_user_id)
);
CREATE TABLE app.trust_events (
  trust_event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trust_grant_id uuid NOT NULL REFERENCES app.trust_grants(trust_grant_id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  old_limit numeric(12,2),
  new_limit numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE TABLE app.obligation_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'CREATED', 'PAYMENT_REPORTED', 'PAYMENT_REJECTED', 'PAYMENT_CANCELLED',
    'PAYMENT_CONFIRMED', 'ROUTED_OUT', 'ROUTED_IN', 'CYCLE_NET', 'VOIDED'
  )),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  related_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX obligation_events_timeline ON app.obligation_events(obligation_id, event_id);

CREATE TABLE app.payment_reports (
  payment_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  debtor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creditor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
  reported_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CHECK (debtor_user_id <> creditor_user_id),
  CHECK ((status = 'PENDING' AND resolved_at IS NULL AND resolved_by IS NULL)
      OR (status <> 'PENDING' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)),
  UNIQUE (debtor_user_id, request_id)
);
CREATE INDEX payment_reports_obligation_pending ON app.payment_reports(obligation_id, status)
  WHERE status = 'PENDING';
CREATE INDEX payment_reports_parties ON app.payment_reports(debtor_user_id, creditor_user_id, reported_at DESC);

CREATE TABLE app.settlement_records (
  settlement_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  payment_id uuid UNIQUE REFERENCES app.payment_reports(payment_id) ON DELETE RESTRICT,
  settlement_type text NOT NULL CHECK (settlement_type IN ('EXTERNAL_PAYMENT', 'ROUTE', 'CYCLE_NET')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX settlement_records_obligation ON app.settlement_records(obligation_id, created_at, settlement_id);

CREATE TABLE app.route_operations (
  route_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  original_obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  resulting_obligation_id uuid REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  source_obligation_ids uuid[] NOT NULL,
  path_user_ids uuid[] NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX route_operations_original ON app.route_operations(original_obligation_id);

CREATE TABLE app.route_previews (
  preview_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  original_obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  source_obligation_ids uuid[] NOT NULL,
  path_user_ids uuid[] NOT NULL,
  version_snapshot jsonb NOT NULL,
  trust_grant_id uuid NOT NULL REFERENCES app.trust_grants(trust_grant_id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  expires_at timestamptz NOT NULL,
  executed_route_id uuid REFERENCES app.route_operations(route_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX route_previews_actor_expiry ON app.route_previews(actor_user_id, expires_at DESC);

CREATE TABLE app.reminder_events (
  reminder_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES app.obligations(obligation_id) ON DELETE RESTRICT,
  creditor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  debtor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX reminder_events_cooldown ON app.reminder_events(obligation_id, created_at DESC);

DO $rls$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'friendships', 'obligations', 'trust_grants', 'trust_events', 'obligation_events',
    'payment_reports', 'settlement_records', 'route_operations', 'route_previews', 'reminder_events'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON app.%I TO nobroke_executor USING (true) WITH CHECK (true)',
      table_name || '_executor', table_name);
  END LOOP;
END
$rls$;
GRANT SELECT, INSERT, UPDATE ON app.friendships, app.obligations, app.trust_grants,
  app.payment_reports, app.route_previews TO nobroke_executor;
GRANT SELECT, INSERT ON app.trust_events, app.obligation_events, app.settlement_records,
  app.route_operations, app.reminder_events TO nobroke_executor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO nobroke_executor;

CREATE FUNCTION private.obligation_reserved_amount(p_obligation_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT COALESCE(pg_catalog.sum(r.amount), 0)::numeric(12,2)
  FROM app.payment_reports AS r
  WHERE r.obligation_id = p_obligation_id AND r.status = 'PENDING'
$$;
ALTER FUNCTION private.obligation_reserved_amount(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.obligation_reserved_amount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.obligation_reserved_amount(uuid) TO nobroke_executor;

CREATE FUNCTION private.obligation_version_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog
AS $function$
BEGIN
  NEW.version_no := OLD.version_no + 1;
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END
$function$;
CREATE TRIGGER obligations_version_guard BEFORE UPDATE ON app.obligations
  FOR EACH ROW EXECUTE FUNCTION private.obligation_version_guard();

CREATE FUNCTION private.reject_immutable_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'financial_history_is_immutable' USING ERRCODE = 'P0001';
END
$function$;
CREATE TRIGGER obligation_events_immutable BEFORE UPDATE OR DELETE ON app.obligation_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_event_mutation();
CREATE TRIGGER trust_events_immutable BEFORE UPDATE OR DELETE ON app.trust_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_event_mutation();
CREATE TRIGGER settlement_records_immutable BEFORE UPDATE OR DELETE ON app.settlement_records
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_event_mutation();

CREATE FUNCTION private.post_expense_obligations(p_expense_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE expense_row app.expenses%ROWTYPE; split_row record; created_obligation uuid;
BEGIN
  SELECT * INTO expense_row FROM app.expenses WHERE expense_id = p_expense_id;
  IF NOT FOUND OR expense_row.status <> 'POSTED' THEN
    RAISE EXCEPTION 'expense_not_posted' USING ERRCODE = 'P0001';
  END IF;
  FOR split_row IN
    SELECT participant_id, share_amount FROM app.expense_splits
    WHERE expense_id = p_expense_id AND participant_id <> expense_row.paid_by
      AND share_amount > 0 ORDER BY participant_id
  LOOP
    INSERT INTO app.obligations(
      debtor_user_id, creditor_user_id, source_group_id, source_expense_id,
      original_amount, remaining_amount, status
    ) VALUES (
      split_row.participant_id, expense_row.paid_by, expense_row.group_id, p_expense_id,
      split_row.share_amount, split_row.share_amount, 'OPEN'
    ) RETURNING obligation_id INTO created_obligation;
    INSERT INTO app.obligation_events(obligation_id, event_type, actor_user_id, amount)
    VALUES (created_obligation, 'CREATED', expense_row.created_by, split_row.share_amount);
  END LOOP;
END
$function$;
ALTER FUNCTION private.post_expense_obligations(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.post_expense_obligations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.post_expense_obligations(uuid) TO nobroke_executor;

CREATE FUNCTION private.void_expense_obligations(p_expense_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app
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
        OR EXISTS (SELECT 1 FROM app.route_operations AS r WHERE r.resulting_obligation_id = o.obligation_id))
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

CREATE FUNCTION private.assert_member_can_leave(p_group_id uuid, p_user_id uuid)
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
    SELECT 1 FROM app.obligations AS o
    JOIN app.route_operations AS r ON o.obligation_id = ANY(r.source_obligation_ids)
    WHERE o.source_group_id = p_group_id AND (o.debtor_user_id = p_user_id OR o.creditor_user_id = p_user_id)
      AND EXISTS (SELECT 1 FROM app.obligations AS current_o
        WHERE current_o.obligation_id = r.resulting_obligation_id AND current_o.status IN ('OPEN', 'PARTIAL'))
  ) THEN RAISE EXCEPTION 'group_member_has_routed_exposure' USING ERRCODE = 'P0001'; END IF;
END
$function$;
ALTER FUNCTION private.assert_member_can_leave(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.assert_member_can_leave(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_member_can_leave(uuid, uuid) TO nobroke_executor;

CREATE FUNCTION private.request_friendship(p_username text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid(); target_id uuid; left_id uuid; right_id uuid; result_id uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT user_id INTO target_id FROM app.profiles WHERE username = pg_catalog.lower(pg_catalog.btrim(p_username));
  IF target_id IS NULL OR target_id = caller_id THEN RAISE EXCEPTION 'friend_not_found' USING ERRCODE = 'P0001'; END IF;
  left_id := LEAST(caller_id, target_id); right_id := GREATEST(caller_id, target_id);
  INSERT INTO app.friendships(user_a, user_b, requested_by, status)
  VALUES (left_id, right_id, caller_id, 'PENDING')
  ON CONFLICT (user_a, user_b) DO UPDATE SET
    requested_by = EXCLUDED.requested_by, status = 'PENDING', blocked_by = NULL,
    updated_at = pg_catalog.clock_timestamp()
  WHERE app.friendships.status IN ('DECLINED')
     OR (app.friendships.status = 'PENDING' AND app.friendships.requested_by = caller_id)
  RETURNING friendship_id INTO result_id;
  IF result_id IS NULL THEN
    SELECT friendship_id INTO result_id FROM app.friendships WHERE user_a = left_id AND user_b = right_id
      AND status IN ('ACTIVE', 'PENDING');
  END IF;
  IF result_id IS NULL THEN RAISE EXCEPTION 'friendship_blocked_or_unavailable' USING ERRCODE = 'P0001'; END IF;
  RETURN result_id;
END
$function$;
ALTER FUNCTION private.request_friendship(text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.request_friendship(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.request_friendship(text) TO authenticated;

CREATE FUNCTION private.respond_friendship(p_friendship_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid(); friendship_row app.friendships%ROWTYPE;
BEGIN
  SELECT * INTO friendship_row FROM app.friendships WHERE friendship_id = p_friendship_id FOR UPDATE;
  IF NOT FOUND OR caller_id NOT IN (friendship_row.user_a, friendship_row.user_b)
     OR friendship_row.requested_by = caller_id OR friendship_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'friendship_response_forbidden' USING ERRCODE = 'P0001';
  END IF;
  UPDATE app.friendships SET status = CASE WHEN p_accept THEN 'ACTIVE' ELSE 'DECLINED' END,
    updated_at = pg_catalog.clock_timestamp() WHERE friendship_id = p_friendship_id;
END
$function$;
ALTER FUNCTION private.respond_friendship(uuid, boolean) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.respond_friendship(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.respond_friendship(uuid, boolean) TO authenticated;

CREATE FUNCTION private.block_friend(p_friendship_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid(); friendship_row app.friendships%ROWTYPE;
BEGIN
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

CREATE FUNCTION private.set_trust_limit(p_debtor_user_id uuid, p_limit_amount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid(); existing_id uuid; old_amount numeric(12,2); used_amount numeric(12,2);
  grant_id uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_limit_amount IS NULL OR p_limit_amount < 0 OR p_limit_amount <> pg_catalog.round(p_limit_amount, 2)
     OR p_limit_amount > 9999999999.99 OR caller_id = p_debtor_user_id THEN
    RAISE EXCEPTION 'invalid_trust_limit' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.friendships f WHERE f.user_a = LEAST(caller_id, p_debtor_user_id)
    AND f.user_b = GREATEST(caller_id, p_debtor_user_id) AND f.status = 'ACTIVE') THEN
    RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001';
  END IF;
  SELECT trust_grant_id, limit_amount INTO existing_id, old_amount FROM app.trust_grants
    WHERE creditor_user_id = caller_id AND debtor_user_id = p_debtor_user_id FOR UPDATE;
  SELECT COALESCE(pg_catalog.sum(remaining_amount), 0)::numeric(12,2) INTO used_amount
    FROM app.obligations WHERE trust_grant_id = existing_id AND status IN ('OPEN', 'PARTIAL');
  IF p_limit_amount < COALESCE(used_amount, 0) THEN
    RAISE EXCEPTION 'trust_limit_below_used_exposure' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO app.trust_grants(creditor_user_id, debtor_user_id, limit_amount)
  VALUES (caller_id, p_debtor_user_id, p_limit_amount::numeric(12,2))
  ON CONFLICT (creditor_user_id, debtor_user_id) DO UPDATE SET
    limit_amount = EXCLUDED.limit_amount, version_no = app.trust_grants.version_no + 1,
    updated_at = pg_catalog.clock_timestamp()
  RETURNING trust_grant_id INTO grant_id;
  INSERT INTO app.trust_events(trust_grant_id, actor_user_id, old_limit, new_limit)
  VALUES (grant_id, caller_id, old_amount, p_limit_amount::numeric(12,2));
  RETURN grant_id;
END
$function$;
ALTER FUNCTION private.set_trust_limit(uuid, numeric) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.set_trust_limit(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_trust_limit(uuid, numeric) TO authenticated;

CREATE FUNCTION private.report_payment(p_obligation_id uuid, p_amount numeric, p_request_id uuid)
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
    IF old_payment.obligation_id <> p_obligation_id OR old_payment.amount <> p_amount THEN
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

CREATE FUNCTION private.resolve_payment(p_payment_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); payment app.payment_reports%ROWTYPE; debt app.obligations%ROWTYPE;
  next_status text;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO payment FROM app.payment_reports WHERE payment_id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO debt FROM app.obligations WHERE obligation_id = payment.obligation_id FOR UPDATE;
  SELECT * INTO payment FROM app.payment_reports WHERE payment_id = p_payment_id FOR UPDATE;
  IF (p_action IN ('CONFIRM', 'REJECT') AND caller_id <> payment.creditor_user_id)
     OR (p_action = 'CANCEL' AND caller_id <> payment.debtor_user_id) THEN
    IF p_action = 'CANCEL' THEN RAISE EXCEPTION 'debtor_required' USING ERRCODE = 'P0001';
    ELSE RAISE EXCEPTION 'creditor_required' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF payment.status <> 'PENDING' THEN
    IF (p_action = 'CONFIRM' AND payment.status = 'CONFIRMED')
       OR (p_action = 'REJECT' AND payment.status = 'REJECTED')
       OR (p_action = 'CANCEL' AND payment.status = 'CANCELLED') THEN
      RETURN pg_catalog.jsonb_build_object('payment_id', payment.payment_id, 'status', payment.status);
    END IF;
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = 'P0001';
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
  INSERT INTO app.obligation_events(obligation_id, event_type, actor_user_id, amount, related_id)
  VALUES (payment.obligation_id,
    CASE p_action WHEN 'CONFIRM' THEN 'PAYMENT_CONFIRMED' WHEN 'REJECT' THEN 'PAYMENT_REJECTED' ELSE 'PAYMENT_CANCELLED' END,
    caller_id, payment.amount, payment.payment_id);
  IF p_action = 'CONFIRM' THEN
    PERFORM private.enqueue_notification(payment.debtor_user_id, 'CASCADES', 'PAYMENT_CONFIRMED',
      'Payment confirmed', 'The creditor confirmed your reported payment.',
      'payment-confirmed:' || payment.payment_id::text);
    PERFORM private.enqueue_notification(payment.creditor_user_id, 'CASCADES', 'PAYMENT_CONFIRMED',
      'Payment recorded', 'The confirmed payment reduced this obligation.',
      'payment-confirmed-creditor:' || payment.payment_id::text);
  END IF;
  RETURN pg_catalog.jsonb_build_object('payment_id', payment.payment_id, 'status', next_status,
    'amount', payment.amount::text, 'obligation_id', payment.obligation_id);
END
$function$;
ALTER FUNCTION private.resolve_payment(uuid, text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.resolve_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_payment(uuid, text) TO authenticated;

CREATE FUNCTION private.preview_route(p_obligation_id uuid, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); source_row app.obligations%ROWTYPE; chosen record; preview uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> pg_catalog.round(p_amount, 2)
     OR p_amount > 9999999999.99 THEN RAISE EXCEPTION 'invalid_route_amount' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO source_row FROM app.obligations WHERE obligation_id = p_obligation_id;
  IF NOT FOUND OR source_row.debtor_user_id <> caller_id OR source_row.status NOT IN ('OPEN', 'PARTIAL') THEN
    RAISE EXCEPTION 'debtor_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount > source_row.remaining_amount - private.obligation_reserved_amount(source_row.obligation_id) THEN
    RAISE EXCEPTION 'route_exceeds_unreserved_debt' USING ERRCODE = 'P0001';
  END IF;
  WITH RECURSIVE walk(user_id, path, obligation_ids, available_amount, depth) AS (
    SELECT source_row.creditor_user_id, ARRAY[caller_id, source_row.creditor_user_id]::uuid[],
      ARRAY[source_row.obligation_id]::uuid[],
      source_row.remaining_amount - private.obligation_reserved_amount(source_row.obligation_id), 1
    UNION ALL
    SELECT next_debt.creditor_user_id, walk.path || next_debt.creditor_user_id,
      walk.obligation_ids || next_debt.obligation_id,
      LEAST(walk.available_amount,
        next_debt.remaining_amount - private.obligation_reserved_amount(next_debt.obligation_id)),
      walk.depth + 1
    FROM walk JOIN app.obligations AS next_debt ON next_debt.debtor_user_id = walk.user_id
    WHERE walk.depth < 5 AND next_debt.status IN ('OPEN', 'PARTIAL')
      AND next_debt.remaining_amount > private.obligation_reserved_amount(next_debt.obligation_id)
      AND NOT next_debt.creditor_user_id = ANY(walk.path)
      AND NOT EXISTS (SELECT 1 FROM app.payment_reports p
        WHERE p.obligation_id = next_debt.obligation_id AND p.status = 'PENDING')
  ), candidates AS (
    SELECT walk.*, grant_row.trust_grant_id, grant_row.limit_amount,
      COALESCE((SELECT pg_catalog.sum(o.remaining_amount) FROM app.obligations o
        WHERE o.trust_grant_id = grant_row.trust_grant_id AND o.status IN ('OPEN', 'PARTIAL')), 0) AS used_amount,
      COALESCE((SELECT pg_catalog.sum(o.remaining_amount - private.obligation_reserved_amount(o.obligation_id))
        FROM app.obligations o WHERE o.obligation_id = ANY(walk.obligation_ids)
          AND o.trust_grant_id = grant_row.trust_grant_id AND o.status IN ('OPEN', 'PARTIAL')), 0) AS released_amount
    FROM walk JOIN app.trust_grants AS grant_row
      ON grant_row.creditor_user_id = walk.user_id AND grant_row.debtor_user_id = caller_id
    JOIN app.friendships AS f ON f.user_a = LEAST(caller_id, walk.user_id)
      AND f.user_b = GREATEST(caller_id, walk.user_id) AND f.status = 'ACTIVE'
    WHERE walk.depth >= 2 AND walk.available_amount >= p_amount
  )
  SELECT * INTO chosen FROM candidates
  WHERE limit_amount - used_amount + released_amount >= p_amount
  ORDER BY depth, path LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'route_unavailable_or_trust_insufficient' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO app.route_previews(actor_user_id, original_obligation_id, source_obligation_ids,
    path_user_ids, version_snapshot, trust_grant_id, amount, expires_at)
  SELECT caller_id, source_row.obligation_id, chosen.obligation_ids, chosen.path,
    (SELECT pg_catalog.jsonb_object_agg(o.obligation_id::text, o.version_no)
       FROM app.obligations o WHERE o.obligation_id = ANY(chosen.obligation_ids)),
    chosen.trust_grant_id, p_amount::numeric(12,2), pg_catalog.clock_timestamp() + interval '5 minutes'
  RETURNING preview_id INTO preview;
  RETURN pg_catalog.jsonb_build_object('preview_id', preview, 'path', to_jsonb(chosen.path),
    'amount', p_amount::numeric(12,2)::text,
    'expires_at', (pg_catalog.clock_timestamp() + interval '5 minutes')::text);
END
$function$;
ALTER FUNCTION private.preview_route(uuid, numeric) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.preview_route(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.preview_route(uuid, numeric) TO authenticated;

CREATE FUNCTION private.execute_route(p_preview_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); preview_row app.route_previews%ROWTYPE; debt_row app.obligations%ROWTYPE;
  grant_row app.trust_grants%ROWTYPE; created_id uuid; new_route_id uuid; total_used numeric(12,2);
  released_amount numeric(12,2);
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO preview_row FROM app.route_previews WHERE preview_id = p_preview_id;
  IF NOT FOUND OR preview_row.actor_user_id <> caller_id THEN RAISE EXCEPTION 'route_preview_not_found' USING ERRCODE = 'P0001'; END IF;
  IF preview_row.executed_route_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('route_id', preview_row.executed_route_id,
      'status', 'ROUTED', 'amount', preview_row.amount::text);
  END IF;
  IF preview_row.expires_at <= pg_catalog.clock_timestamp() THEN RAISE EXCEPTION 'stale_route_preview' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM app.expense_groups g WHERE g.group_id IN (
    SELECT DISTINCT o.source_group_id FROM app.obligations o
    WHERE o.obligation_id = ANY(preview_row.source_obligation_ids)) ORDER BY g.group_id FOR UPDATE;
  PERFORM 1 FROM app.expenses e WHERE e.expense_id IN (
    SELECT DISTINCT o.source_expense_id FROM app.obligations o
    WHERE o.obligation_id = ANY(preview_row.source_obligation_ids)) ORDER BY e.expense_id FOR UPDATE;
  PERFORM 1 FROM app.obligations WHERE obligation_id = ANY(preview_row.source_obligation_ids)
    ORDER BY obligation_id FOR UPDATE;
  SELECT * INTO preview_row FROM app.route_previews WHERE preview_id = p_preview_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.obligations o WHERE o.obligation_id = ANY(preview_row.source_obligation_ids)
    AND preview_row.version_snapshot ->> o.obligation_id::text IS DISTINCT FROM o.version_no::text) THEN
    RAISE EXCEPTION 'stale_route_preview' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM app.obligations o WHERE o.obligation_id = ANY(preview_row.source_obligation_ids)
    AND (o.status NOT IN ('OPEN', 'PARTIAL') OR o.remaining_amount - private.obligation_reserved_amount(o.obligation_id) < preview_row.amount
      OR EXISTS (SELECT 1 FROM app.payment_reports p WHERE p.obligation_id = o.obligation_id AND p.status = 'PENDING'))) THEN
    RAISE EXCEPTION 'stale_route_preview' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO debt_row FROM app.obligations WHERE obligation_id = preview_row.original_obligation_id;
  SELECT * INTO grant_row FROM app.trust_grants WHERE trust_grant_id = preview_row.trust_grant_id FOR UPDATE;
  IF grant_row.creditor_user_id <> preview_row.path_user_ids[array_upper(preview_row.path_user_ids, 1)]
    OR grant_row.debtor_user_id <> caller_id OR NOT EXISTS (
      SELECT 1 FROM app.friendships f WHERE f.user_a = LEAST(caller_id, grant_row.creditor_user_id)
        AND f.user_b = GREATEST(caller_id, grant_row.creditor_user_id) AND f.status = 'ACTIVE') THEN
    RAISE EXCEPTION 'stale_route_preview' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(pg_catalog.sum(remaining_amount), 0)::numeric(12,2) INTO total_used
    FROM app.obligations WHERE trust_grant_id = grant_row.trust_grant_id AND status IN ('OPEN', 'PARTIAL');
  SELECT COALESCE(pg_catalog.sum(o.remaining_amount - private.obligation_reserved_amount(o.obligation_id)), 0)::numeric(12,2)
    INTO released_amount FROM app.obligations o
    WHERE o.obligation_id = ANY(preview_row.source_obligation_ids)
      AND o.trust_grant_id = grant_row.trust_grant_id AND o.status IN ('OPEN', 'PARTIAL');
  IF total_used - released_amount + preview_row.amount > grant_row.limit_amount THEN
    RAISE EXCEPTION 'stale_route_preview' USING ERRCODE = 'P0001';
  END IF;
  UPDATE app.obligations SET remaining_amount = remaining_amount - preview_row.amount,
    status = CASE WHEN remaining_amount - preview_row.amount = 0 THEN 'SETTLED' ELSE 'PARTIAL' END
  WHERE obligation_id = ANY(preview_row.source_obligation_ids);
  INSERT INTO app.obligations(debtor_user_id, creditor_user_id, source_group_id, source_expense_id,
    original_amount, remaining_amount, status, is_routed, trust_grant_id)
  VALUES (caller_id, grant_row.creditor_user_id, debt_row.source_group_id, debt_row.source_expense_id,
    preview_row.amount, preview_row.amount, 'OPEN', true, grant_row.trust_grant_id)
  ON CONFLICT (source_expense_id, debtor_user_id, creditor_user_id, is_routed, trust_grant_id)
  DO UPDATE SET original_amount = app.obligations.original_amount + EXCLUDED.original_amount,
    remaining_amount = app.obligations.remaining_amount + EXCLUDED.remaining_amount,
    status = CASE WHEN app.obligations.remaining_amount + EXCLUDED.remaining_amount
      = app.obligations.original_amount + EXCLUDED.original_amount THEN 'OPEN' ELSE 'PARTIAL' END
  RETURNING obligation_id INTO created_id;
  INSERT INTO app.route_operations(actor_user_id, original_obligation_id, resulting_obligation_id,
    source_obligation_ids, path_user_ids, amount)
  VALUES (caller_id, preview_row.original_obligation_id, created_id,
    preview_row.source_obligation_ids, preview_row.path_user_ids, preview_row.amount)
  RETURNING route_id INTO new_route_id;
  INSERT INTO app.obligation_events(obligation_id, event_type, actor_user_id, amount, related_id)
  SELECT obligation_id, 'ROUTED_OUT', caller_id, preview_row.amount, new_route_id
  FROM app.obligations WHERE obligation_id = ANY(preview_row.source_obligation_ids);
  INSERT INTO app.obligation_events(obligation_id, event_type, actor_user_id, amount, related_id)
  VALUES (created_id, 'ROUTED_IN', caller_id, preview_row.amount, new_route_id);
  UPDATE app.route_previews SET executed_route_id = new_route_id WHERE preview_id = p_preview_id;
  RETURN pg_catalog.jsonb_build_object('route_id', new_route_id, 'obligation_id', created_id,
    'status', 'ROUTED', 'amount', preview_row.amount::text, 'path', to_jsonb(preview_row.path_user_ids));
END
$function$;
ALTER FUNCTION private.execute_route(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.execute_route(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.execute_route(uuid) TO authenticated;

CREATE FUNCTION private.remind_debtor(p_obligation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); debt_row app.obligations%ROWTYPE; reminder uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO debt_row FROM app.obligations WHERE obligation_id = p_obligation_id FOR UPDATE;
  IF NOT FOUND OR debt_row.creditor_user_id <> caller_id THEN RAISE EXCEPTION 'creditor_required' USING ERRCODE = 'P0001'; END IF;
  IF debt_row.status NOT IN ('OPEN', 'PARTIAL') THEN RAISE EXCEPTION 'obligation_not_open' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM app.reminder_events WHERE obligation_id = p_obligation_id
    AND created_at > pg_catalog.clock_timestamp() - interval '24 hours') THEN
    RAISE EXCEPTION 'reminder_cooldown_active' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO app.reminder_events(obligation_id, creditor_user_id, debtor_user_id)
  VALUES (p_obligation_id, caller_id, debt_row.debtor_user_id) RETURNING reminder_id INTO reminder;
  PERFORM private.enqueue_notification(debt_row.debtor_user_id, 'REMINDERS', 'PAYMENT_REMINDER',
    'Payment reminder', 'A creditor sent you a reminder about an open obligation.',
    'payment-reminder:' || p_obligation_id::text || ':' || pg_catalog.to_char(pg_catalog.clock_timestamp(), 'YYYY-MM-DD-HH24'));
  RETURN reminder;
END
$function$;
ALTER FUNCTION private.remind_debtor(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.remind_debtor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.remind_debtor(uuid) TO authenticated;

CREATE FUNCTION api.request_friendship(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE result_id uuid; BEGIN PERFORM private.lock_financial_writes();
  result_id := private.request_friendship(p_username);
  RETURN pg_catalog.jsonb_build_object('friendship_id', result_id);
END $$;
CREATE FUNCTION api.respond_friendship(p_friendship_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN PERFORM private.lock_financial_writes(); PERFORM private.respond_friendship(p_friendship_id, p_accept);
  RETURN pg_catalog.jsonb_build_object('friendship_id', p_friendship_id,
    'status', CASE WHEN p_accept THEN 'ACTIVE' ELSE 'DECLINED' END);
END $$;
CREATE FUNCTION api.block_friend(p_friendship_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN PERFORM private.lock_financial_writes(); PERFORM private.block_friend(p_friendship_id);
  RETURN pg_catalog.jsonb_build_object('friendship_id', p_friendship_id, 'status', 'BLOCKED');
END $$;
CREATE FUNCTION api.set_trust_limit(p_debtor_user_id uuid, p_limit_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE result_id uuid; BEGIN PERFORM private.lock_financial_writes();
  result_id := private.set_trust_limit(p_debtor_user_id, p_limit_amount);
  RETURN pg_catalog.jsonb_build_object('trust_grant_id', result_id, 'limit_amount', p_limit_amount::numeric(12,2)::text);
END $$;
CREATE FUNCTION api.report_payment(p_obligation_id uuid, p_amount numeric, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE payment uuid; BEGIN PERFORM private.lock_financial_writes();
  payment := private.report_payment(p_obligation_id, p_amount, p_request_id);
  RETURN pg_catalog.jsonb_build_object('payment_id', payment, 'status', 'PENDING');
END $$;
CREATE FUNCTION api.confirm_payment(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN PERFORM private.lock_financial_writes(); RETURN private.resolve_payment(p_payment_id, 'CONFIRM'); END $$;
CREATE FUNCTION api.reject_payment(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN PERFORM private.lock_financial_writes(); RETURN private.resolve_payment(p_payment_id, 'REJECT'); END $$;
CREATE FUNCTION api.cancel_payment(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN PERFORM private.lock_financial_writes(); RETURN private.resolve_payment(p_payment_id, 'CANCEL'); END $$;
CREATE FUNCTION api.preview_route(p_obligation_id uuid, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN RETURN private.preview_route(p_obligation_id, p_amount); END $$;
CREATE FUNCTION api.execute_route(p_preview_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN PERFORM private.lock_financial_writes(); RETURN private.execute_route(p_preview_id); END $$;
CREATE FUNCTION api.remind_debtor(p_obligation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE reminder uuid; BEGIN PERFORM private.lock_financial_writes();
  reminder := private.remind_debtor(p_obligation_id);
  RETURN pg_catalog.jsonb_build_object('reminder_id', reminder, 'status', 'SENT');
END $$;

CREATE FUNCTION private.list_my_friends(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(row_value ORDER BY friendship_id), '[]'::jsonb)
  FROM (
    SELECT f.friendship_id, pg_catalog.jsonb_build_object(
      'friendship_id', f.friendship_id, 'friend_id', peer.user_id,
      'username', peer.username, 'display_name', peer.display_name,
      'status', f.status, 'requested_by', f.requested_by,
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

CREATE FUNCTION private.list_my_obligations(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY obligation_id), '[]'::jsonb)
  FROM (
    SELECT o.obligation_id, pg_catalog.jsonb_build_object(
      'obligation_id', o.obligation_id, 'debtor_user_id', o.debtor_user_id,
      'creditor_user_id', o.creditor_user_id, 'group_id', o.source_group_id,
      'expense_id', o.source_expense_id, 'expense_title', e.title,
      'original_amount', o.original_amount::text, 'remaining_amount', o.remaining_amount::text,
      'cleared_percent', CASE WHEN o.original_amount = 0 THEN 100
        ELSE pg_catalog.round(100 * (o.original_amount - o.remaining_amount) / o.original_amount)::integer END,
      'reserved_amount', private.obligation_reserved_amount(o.obligation_id)::text,
      'status', o.status, 'is_routed', o.is_routed, 'created_at', o.created_at::text,
      'counterparty_username', peer.username, 'counterparty_name', peer.display_name,
      'group_name', g.group_name
    ) AS item
    FROM app.obligations o JOIN app.expenses e ON e.expense_id = o.source_expense_id
    JOIN app.profiles peer ON peer.user_id = CASE WHEN o.debtor_user_id = auth.uid()
      THEN o.creditor_user_id ELSE o.debtor_user_id END
    JOIN app.expense_groups g ON g.group_id = o.source_group_id
    WHERE auth.uid() IN (o.debtor_user_id, o.creditor_user_id)
      AND (p_after_id IS NULL OR o.obligation_id > p_after_id)
    ORDER BY o.obligation_id LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) page
$$;
ALTER FUNCTION private.list_my_obligations(uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_my_obligations(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_my_obligations(uuid, integer) TO authenticated;

CREATE FUNCTION private.get_group_balances(p_group_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $$
  SELECT CASE WHEN private.is_active_member(p_group_id, auth.uid()) THEN COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', m.user_id, 'username', p.username, 'display_name', p.display_name,
      'net_amount', (COALESCE(receivable.total, 0) - COALESCE(payable.total, 0))::numeric(12,2)::text
    ) ORDER BY m.user_id)
    FROM app.group_memberships m JOIN app.profiles p ON p.user_id = m.user_id
    LEFT JOIN LATERAL (SELECT pg_catalog.sum(o.remaining_amount) AS total FROM app.obligations o
      WHERE o.source_group_id = p_group_id AND o.creditor_user_id = m.user_id
        AND o.status IN ('OPEN', 'PARTIAL')) receivable ON true
    LEFT JOIN LATERAL (SELECT pg_catalog.sum(o.remaining_amount) AS total FROM app.obligations o
      WHERE o.source_group_id = p_group_id AND o.debtor_user_id = m.user_id
        AND o.status IN ('OPEN', 'PARTIAL')) payable ON true
    WHERE m.group_id = p_group_id AND m.removed_at IS NULL
  ), '[]'::jsonb) ELSE NULL END
$$;
ALTER FUNCTION private.get_group_balances(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.get_group_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_group_balances(uuid) TO authenticated;

CREATE FUNCTION private.list_payment_reports(p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY reported_at DESC, payment_id DESC), '[]'::jsonb)
  FROM (
    SELECT r.payment_id, r.reported_at, pg_catalog.jsonb_build_object(
      'payment_id', r.payment_id, 'obligation_id', r.obligation_id,
      'debtor_user_id', r.debtor_user_id, 'creditor_user_id', r.creditor_user_id,
      'amount', r.amount::text, 'status', r.status, 'reported_at', r.reported_at::text,
      'resolved_at', r.resolved_at::text, 'debtor_name', d.display_name, 'creditor_name', c.display_name
    ) AS item
    FROM app.payment_reports r JOIN app.profiles d ON d.user_id = r.debtor_user_id
    JOIN app.profiles c ON c.user_id = r.creditor_user_id
    WHERE auth.uid() IN (r.debtor_user_id, r.creditor_user_id)
      AND (p_after_created_at IS NULL OR (r.reported_at, r.payment_id) < (p_after_created_at, p_after_id))
    ORDER BY r.reported_at DESC, r.payment_id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) page
$$;
ALTER FUNCTION private.list_payment_reports(timestamptz, uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_payment_reports(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_payment_reports(timestamptz, uuid, integer) TO authenticated;

CREATE FUNCTION private.list_settlement_history(p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY created_at DESC, settlement_id DESC), '[]'::jsonb)
  FROM (
    SELECT s.settlement_id, s.created_at, pg_catalog.jsonb_build_object(
      'settlement_id', s.settlement_id, 'obligation_id', s.obligation_id,
      'type', s.settlement_type, 'amount', s.amount::text,
      'from_user_id', s.from_user_id, 'to_user_id', s.to_user_id,
      'created_at', s.created_at::text
    ) AS item
    FROM app.settlement_records s
    WHERE auth.uid() IN (s.from_user_id, s.to_user_id)
      AND (p_after_created_at IS NULL OR (s.created_at, s.settlement_id) < (p_after_created_at, p_after_id))
    ORDER BY s.created_at DESC, s.settlement_id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) page
$$;
ALTER FUNCTION private.list_settlement_history(timestamptz, uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_settlement_history(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_settlement_history(timestamptz, uuid, integer) TO authenticated;

CREATE FUNCTION api.list_my_friends(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT private.list_my_friends(p_after_id, p_limit)
$$;
CREATE FUNCTION api.list_my_obligations(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT private.list_my_obligations(p_after_id, p_limit)
$$;
CREATE FUNCTION api.get_group_balances(p_group_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT private.get_group_balances(p_group_id)
$$;
CREATE FUNCTION api.list_payment_reports(p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT private.list_payment_reports(p_after_created_at, p_after_id, p_limit)
$$;
CREATE FUNCTION api.list_settlement_history(p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT private.list_settlement_history(p_after_created_at, p_after_id, p_limit)
$$;

CREATE FUNCTION private.list_route_history(p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY created_at DESC, route_id DESC), '[]'::jsonb)
  FROM (
    SELECT r.route_id, r.created_at, pg_catalog.jsonb_build_object(
      'route_id', r.route_id, 'original_obligation_id', r.original_obligation_id,
      'amount', r.amount::text, 'path', to_jsonb(r.path_user_ids), 'created_at', r.created_at::text
    ) AS item
    FROM app.route_operations r
    WHERE auth.uid() = ANY(r.path_user_ids)
      AND (p_after_created_at IS NULL OR (r.created_at, r.route_id) < (p_after_created_at, p_after_id))
    ORDER BY r.created_at DESC, r.route_id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) page
$$;
ALTER FUNCTION private.list_route_history(timestamptz, uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_route_history(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_route_history(timestamptz, uuid, integer) TO authenticated;
CREATE FUNCTION api.list_route_history(p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT private.list_route_history(p_after_created_at, p_after_id, p_limit)
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO authenticated;
