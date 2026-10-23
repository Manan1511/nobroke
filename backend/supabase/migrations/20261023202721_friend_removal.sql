-- Remove an active friendship without deleting financial or settlement history.

ALTER TABLE app.friendships
  DROP CONSTRAINT IF EXISTS friendships_status_check;

ALTER TABLE app.friendships
  ADD CONSTRAINT friendships_status_check
  CHECK (status IN ('PENDING', 'ACTIVE', 'DECLINED', 'BLOCKED', 'REMOVED'));

CREATE OR REPLACE FUNCTION private.request_friendship(p_username text)
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
  WHERE app.friendships.status IN ('DECLINED', 'REMOVED')
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
      AND f.status <> 'REMOVED'
      AND (p_after_id IS NULL OR f.friendship_id > p_after_id)
    ORDER BY f.friendship_id LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) page
$$;
ALTER FUNCTION private.list_my_friends(uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_my_friends(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_my_friends(uuid, integer) TO authenticated;

CREATE FUNCTION private.remove_friend(p_friendship_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid(); friendship_row app.friendships%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  PERFORM private.lock_financial_writes();
  SELECT * INTO friendship_row FROM app.friendships WHERE friendship_id = p_friendship_id FOR UPDATE;
  IF NOT FOUND OR caller_id NOT IN (friendship_row.user_a, friendship_row.user_b) THEN
    RAISE EXCEPTION 'friendship_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF friendship_row.status = 'REMOVED' THEN RETURN; END IF;
  IF friendship_row.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'friendship_not_active' USING ERRCODE = 'P0001';
  END IF;

  UPDATE app.friendships
  SET status = 'REMOVED', blocked_by = NULL, updated_at = pg_catalog.clock_timestamp()
  WHERE friendship_id = p_friendship_id;
END
$function$;
ALTER FUNCTION private.remove_friend(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.remove_friend(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.remove_friend(uuid) TO authenticated;

CREATE FUNCTION api.remove_friend(p_friendship_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  PERFORM private.remove_friend(p_friendship_id);
  RETURN pg_catalog.jsonb_build_object('friendship_id', p_friendship_id, 'status', 'REMOVED');
END
$function$;
REVOKE ALL ON FUNCTION api.remove_friend(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.remove_friend(uuid) TO authenticated;
