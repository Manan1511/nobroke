-- Reusable group links and friend-based member additions. All browser writes
-- remain behind authenticated INVOKER wrappers and private authorization.

ALTER TABLE app.expense_groups
  ADD COLUMN members_can_invite_friends boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.accept_group_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, extensions
AS $function$
DECLARE
  caller_id uuid := private.request_user_id();
  computed_hash bytea;
  invite_group uuid;
  invite_row app.group_invites%ROWTYPE;
BEGIN
  IF caller_id IS NULL OR p_token IS NULL OR pg_catalog.length(p_token) <> 64 THEN
    RAISE EXCEPTION 'invalid_or_expired_invite' USING ERRCODE = 'P0001';
  END IF;
  computed_hash := extensions.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256');

  SELECT group_id INTO invite_group
  FROM app.group_invites
  WHERE token_hash = computed_hash;
  IF invite_group IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_invite' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM app.expense_groups WHERE group_id = invite_group FOR UPDATE;
  SELECT * INTO invite_row
  FROM app.group_invites
  WHERE token_hash = computed_hash AND group_id = invite_group
  FOR UPDATE;
  IF NOT FOUND OR invite_row.revoked_at IS NOT NULL
      OR invite_row.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'invalid_or_expired_invite' USING ERRCODE = 'P0001';
  END IF;

  -- Acceptance does not consume the token. The group row lock plus the
  -- partial unique membership index makes repeated/concurrent joins safe.
  INSERT INTO app.group_memberships (group_id, user_id, member_role)
  VALUES (invite_group, caller_id, 'MEMBER')
  ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING;
  RETURN invite_group;
END;
$function$;
ALTER FUNCTION private.accept_group_invite(text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.accept_group_invite(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.accept_group_invite(text) TO authenticated;

CREATE OR REPLACE FUNCTION private.revoke_group_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE
  invite_group uuid;
  caller_id uuid := private.request_user_id();
BEGIN
  SELECT group_id INTO invite_group
  FROM app.group_invites
  WHERE invite_id = p_invite_id;
  IF invite_group IS NULL THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM app.expense_groups WHERE group_id = invite_group FOR UPDATE;
  IF NOT private.is_group_owner(invite_group, caller_id) THEN
    RAISE EXCEPTION 'group_owner_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE app.group_invites
  SET revoked_at = pg_catalog.clock_timestamp()
  WHERE invite_id = p_invite_id AND group_id = invite_group AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_owner_required_or_invite_unavailable' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;
ALTER FUNCTION private.revoke_group_invite(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.revoke_group_invite(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.revoke_group_invite(uuid) TO authenticated;

CREATE FUNCTION private.list_group_invites(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  caller_id uuid := private.request_user_id();
  invites jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.is_group_owner(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'group_owner_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'invite_id', invite_id,
    'created_at', created_at::text,
    'expires_at', expires_at::text
  ) ORDER BY created_at DESC, invite_id), '[]'::jsonb)
  INTO invites
  FROM app.group_invites
  WHERE group_id = p_group_id
    AND revoked_at IS NULL
    AND expires_at > pg_catalog.clock_timestamp();

  RETURN invites;
END;
$function$;
ALTER FUNCTION private.list_group_invites(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_group_invites(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.list_group_invites(uuid) TO authenticated;

CREATE FUNCTION private.set_group_member_invites(p_group_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE
  caller_id uuid := private.request_user_id();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid_group_invite_setting' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM app.expense_groups WHERE group_id = p_group_id FOR UPDATE;
  IF NOT FOUND OR NOT private.is_group_owner(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'group_owner_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE app.expense_groups
  SET members_can_invite_friends = p_enabled,
      updated_at = pg_catalog.clock_timestamp()
  WHERE group_id = p_group_id;
END;
$function$;
ALTER FUNCTION private.set_group_member_invites(uuid, boolean) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.set_group_member_invites(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_group_member_invites(uuid, boolean) TO authenticated;

CREATE FUNCTION private.add_group_friend(p_group_id uuid, p_friend_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE
  caller_id uuid := private.request_user_id();
  group_row app.expense_groups%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_group_id IS NULL OR p_friend_id IS NULL THEN
    RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO group_row
  FROM app.expense_groups
  WHERE group_id = p_group_id
  FOR UPDATE;
  IF NOT FOUND OR NOT private.is_active_member(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'group_access_denied' USING ERRCODE = 'P0001';
  END IF;

  IF NOT private.is_group_owner(p_group_id, caller_id)
      AND NOT group_row.members_can_invite_friends THEN
    RAISE EXCEPTION 'group_member_invites_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF private.is_active_member(p_group_id, p_friend_id) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.friendships AS f
    WHERE f.user_a = LEAST(caller_id, p_friend_id)
      AND f.user_b = GREATEST(caller_id, p_friend_id)
      AND f.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO app.group_memberships (group_id, user_id, member_role)
  VALUES (p_group_id, p_friend_id, 'MEMBER')
  ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING;
  RETURN FOUND;
END;
$function$;
ALTER FUNCTION private.add_group_friend(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.add_group_friend(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.add_group_friend(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION api.get_group(p_group_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, app, auth, private
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'group_id', group_id,
    'group_name', group_name,
    'created_by', created_by,
    'created_at', created_at::text,
    'members_can_invite_friends', members_can_invite_friends,
    'role', (
      SELECT member_role FROM app.group_memberships
      WHERE group_id = p_group_id AND user_id = auth.uid() AND removed_at IS NULL
    )
  )
  FROM app.expense_groups
  WHERE group_id = p_group_id AND private.is_active_member(group_id, auth.uid())
$$;

CREATE FUNCTION api.set_group_member_invites(p_group_id uuid, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  PERFORM private.set_group_member_invites(p_group_id, p_enabled);
  RETURN pg_catalog.jsonb_build_object('group_id', p_group_id, 'enabled', p_enabled);
END;
$function$;
REVOKE ALL ON FUNCTION api.set_group_member_invites(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.set_group_member_invites(uuid, boolean) TO authenticated;

CREATE FUNCTION api.add_group_friend(p_group_id uuid, p_friend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
DECLARE added boolean;
BEGIN
  PERFORM private.lock_financial_writes();
  added := private.add_group_friend(p_group_id, p_friend_id);
  RETURN pg_catalog.jsonb_build_object(
    'group_id', p_group_id, 'user_id', p_friend_id, 'added', added
  );
END;
$function$;
REVOKE ALL ON FUNCTION api.add_group_friend(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.add_group_friend(uuid, uuid) TO authenticated;

CREATE FUNCTION api.list_group_invites(p_group_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT private.list_group_invites(p_group_id) $$;
REVOKE ALL ON FUNCTION api.list_group_invites(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_group_invites(uuid) TO authenticated;
