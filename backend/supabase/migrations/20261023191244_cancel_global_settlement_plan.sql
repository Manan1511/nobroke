ALTER TABLE app.global_settlement_events
  DROP CONSTRAINT global_settlement_events_event_type_check;

ALTER TABLE app.global_settlement_events
  ADD CONSTRAINT global_settlement_events_event_type_check
  CHECK (event_type IN (
    'PREVIEWED', 'ACCEPTED', 'PAYMENT_REPORTED', 'PAYMENT_CONFIRMED',
    'PAYMENT_REJECTED', 'PAYMENT_CANCELLED', 'PLAN_CANCELLED', 'PLAN_DECLINED',
    'PLAN_COMPLETED', 'PLAN_EXPIRED'
  ));

CREATE FUNCTION private.create_or_reuse_global_settlement_preview(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  plan_row app.global_settlement_plans%ROWTYPE;
  snapshot jsonb;
  fresh_source_ids uuid[];
  fresh_participant_ids uuid[];
  changed_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request_id' USING ERRCODE = 'P0001';
  END IF;

  PERFORM private.lock_financial_writes();
  SELECT * INTO plan_row
  FROM app.global_settlement_plans plan
  WHERE plan.created_by = caller_id AND plan.status = 'PREVIEW'
    AND plan.expires_at > pg_catalog.clock_timestamp()
  ORDER BY plan.created_at DESC, plan.plan_id DESC
  LIMIT 1;

  IF FOUND THEN
    snapshot := private.global_settlement_candidate_snapshot(caller_id);
    SELECT pg_catalog.array_agg((item ->> 'obligation_id')::uuid ORDER BY (item ->> 'obligation_id')::uuid)
      INTO fresh_source_ids FROM pg_catalog.jsonb_array_elements(snapshot -> 'obligations') AS rows(item);
    SELECT pg_catalog.array_agg(value::uuid ORDER BY value::uuid)
      INTO fresh_participant_ids FROM pg_catalog.jsonb_array_elements_text(snapshot -> 'users') AS users(value);

    IF fresh_source_ids IS NOT DISTINCT FROM plan_row.source_obligation_ids
        AND fresh_participant_ids IS NOT DISTINCT FROM plan_row.participant_ids
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(plan_row.participant_ids) AS users(user_id)
          WHERE NOT COALESCE((SELECT pref.enabled FROM app.global_netting_preferences pref
            WHERE pref.user_id = users.user_id), true))
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(plan_row.source_obligation_ids) AS ids(obligation_id)
          LEFT JOIN app.obligations obligation ON obligation.obligation_id = ids.obligation_id
          WHERE obligation.obligation_id IS NULL OR obligation.status NOT IN ('OPEN', 'PARTIAL')
            OR obligation.remaining_amount <> (plan_row.version_snapshot -> obligation.obligation_id::text ->> 'remaining_amount')::numeric
            OR obligation.version_no <> (plan_row.version_snapshot -> obligation.obligation_id::text ->> 'version_no')::bigint
            OR private.obligation_reserved_amount(obligation.obligation_id) <> 0) THEN
      RETURN private.get_global_settlement_plan(plan_row.plan_id);
    END IF;

    UPDATE app.global_settlement_transfers
    SET status = 'CANCELLED', resolved_at = changed_at, resolved_by = caller_id
    WHERE plan_id = plan_row.plan_id AND status = 'PLANNED';
    UPDATE app.global_settlement_plans SET status = 'CANCELLED' WHERE plan_id = plan_row.plan_id;
    INSERT INTO app.global_settlement_events(plan_id, event_type, actor_user_id)
    VALUES (plan_row.plan_id, 'PLAN_CANCELLED', caller_id);
  END IF;
  RETURN private.create_global_settlement_preview(p_request_id);
END
$function$;
ALTER FUNCTION private.create_or_reuse_global_settlement_preview(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.create_or_reuse_global_settlement_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_or_reuse_global_settlement_preview(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION api.preview_global_settlement(p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.create_or_reuse_global_settlement_preview(p_request_id)
$$;
ALTER FUNCTION api.preview_global_settlement(uuid) SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION api.preview_global_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.preview_global_settlement(uuid) TO authenticated;

CREATE FUNCTION private.cancel_global_settlement_plan(p_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  plan_row app.global_settlement_plans%ROWTYPE;
  event_kind text;
  changed_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;

  PERFORM private.lock_financial_writes();
  SELECT * INTO plan_row
  FROM app.global_settlement_plans p
  WHERE p.plan_id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM app.global_settlement_participants participant
    WHERE participant.plan_id = p_plan_id AND participant.user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'global_settlement_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF plan_row.status <> 'PREVIEW' OR EXISTS (
    SELECT 1 FROM app.global_settlement_transfers transfer
    WHERE transfer.plan_id = p_plan_id AND transfer.status <> 'PLANNED'
  ) THEN
    RAISE EXCEPTION 'global_settlement_plan_unavailable' USING ERRCODE = 'P0001';
  END IF;

  event_kind := CASE WHEN plan_row.created_by = caller_id THEN 'PLAN_CANCELLED' ELSE 'PLAN_DECLINED' END;
  UPDATE app.global_settlement_transfers
  SET status = 'CANCELLED', resolved_at = changed_at, resolved_by = caller_id
  WHERE plan_id = p_plan_id AND status = 'PLANNED';
  UPDATE app.global_settlement_plans
  SET status = 'CANCELLED'
  WHERE plan_id = p_plan_id;
  INSERT INTO app.global_settlement_events(plan_id, event_type, actor_user_id)
  VALUES (p_plan_id, event_kind, caller_id);

  RETURN private.get_global_settlement_plan(p_plan_id);
END
$function$;
ALTER FUNCTION private.cancel_global_settlement_plan(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.cancel_global_settlement_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.cancel_global_settlement_plan(uuid) TO authenticated;

CREATE FUNCTION api.cancel_global_settlement_plan(p_plan_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT private.cancel_global_settlement_plan(p_plan_id)
$$;
ALTER FUNCTION api.cancel_global_settlement_plan(uuid) SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION api.cancel_global_settlement_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.cancel_global_settlement_plan(uuid) TO authenticated;
