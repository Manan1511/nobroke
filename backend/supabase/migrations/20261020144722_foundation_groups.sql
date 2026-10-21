-- NoBroke group/auth foundation. All API entry points are thin INVOKER wrappers;
-- the unexposed private schema contains the narrowly granted database operations.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS api;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'nobroke_executor') THEN
    CREATE ROLE nobroke_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$roles$;

-- Hosted Supabase's `postgres` role is not a superuser. Give it membership in
-- the restricted owner role so migrations can transfer function ownership.
GRANT nobroke_executor TO postgres;
GRANT USAGE ON SCHEMA app TO nobroke_executor;
GRANT USAGE, CREATE ON SCHEMA private TO nobroke_executor;
GRANT USAGE ON SCHEMA api TO authenticated;
GRANT USAGE ON SCHEMA app, private TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated, nobroke_executor;
GRANT EXECUTE ON FUNCTION extensions.digest(bytea, text) TO nobroke_executor, authenticated;
GRANT EXECUTE ON FUNCTION extensions.gen_random_bytes(integer) TO nobroke_executor, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, nobroke_executor;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA api
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE app.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE RESTRICT,
  username text NOT NULL UNIQUE
    CHECK (username = pg_catalog.lower(username) AND username ~ '^[a-z0-9][a-z0-9_.-]{1,39}$'),
  display_name text NOT NULL
    CHECK (pg_catalog.length(pg_catalog.btrim(display_name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE TABLE app.expense_groups (
  group_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_name text NOT NULL
    CHECK (pg_catalog.length(pg_catalog.btrim(group_name)) BETWEEN 1 AND 100),
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE TABLE app.group_memberships (
  membership_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES app.expense_groups (group_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  member_role text NOT NULL CHECK (member_role IN ('OWNER', 'MEMBER')),
  joined_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  removed_at timestamptz,
  removed_by uuid REFERENCES auth.users (id) ON DELETE RESTRICT,
  CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);

CREATE UNIQUE INDEX group_memberships_one_active_pair
  ON app.group_memberships (group_id, user_id) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX group_memberships_one_active_owner
  ON app.group_memberships (group_id) WHERE removed_at IS NULL AND member_role = 'OWNER';
CREATE INDEX group_memberships_user_group_active
  ON app.group_memberships (user_id, group_id) WHERE removed_at IS NULL;
CREATE INDEX group_memberships_group_user_history
  ON app.group_memberships (group_id, joined_at DESC, user_id);

CREATE TABLE app.group_invites (
  invite_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES app.expense_groups (group_id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users (id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK ((accepted_at IS NULL) = (accepted_by IS NULL))
);
CREATE INDEX group_invites_group_created ON app.group_invites (group_id, created_at DESC);

ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.expense_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.group_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_executor ON app.profiles TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY groups_executor ON app.expense_groups TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY memberships_executor ON app.group_memberships TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY invites_executor ON app.group_invites TO nobroke_executor
  USING (true) WITH CHECK (true);

GRANT SELECT ON app.profiles, app.expense_groups, app.group_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.profiles, app.expense_groups,
  app.group_memberships, app.group_invites TO nobroke_executor;
GRANT USAGE ON SCHEMA app, private TO authenticated;

CREATE FUNCTION private.is_active_member(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.group_memberships AS gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_user_id
      AND gm.removed_at IS NULL
  );
$$;
ALTER FUNCTION private.is_active_member(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.is_active_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active_member(uuid, uuid) TO authenticated;

CREATE FUNCTION private.is_group_owner(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.group_memberships AS gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_user_id
      AND gm.member_role = 'OWNER'
      AND gm.removed_at IS NULL
  );
$$;
ALTER FUNCTION private.is_group_owner(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.is_group_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_group_owner(uuid, uuid) TO authenticated;

CREATE FUNCTION private.profiles_share_group(p_target_user uuid, p_viewer uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.group_memberships AS target
    JOIN app.group_memberships AS viewer USING (group_id)
    WHERE target.user_id = p_target_user AND target.removed_at IS NULL
      AND viewer.user_id = p_viewer AND viewer.removed_at IS NULL
  );
$$;
ALTER FUNCTION private.profiles_share_group(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.profiles_share_group(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.profiles_share_group(uuid, uuid) TO authenticated;

CREATE POLICY profiles_read_self_or_group_peer ON app.profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
    OR private.profiles_share_group(user_id, (SELECT auth.uid())));
CREATE POLICY groups_read_active_members ON app.expense_groups FOR SELECT TO authenticated
  USING (private.is_active_member(group_id, (SELECT auth.uid())));
CREATE POLICY memberships_read_active_groups ON app.group_memberships FOR SELECT TO authenticated
  USING (private.is_active_member(group_id, (SELECT auth.uid())));

CREATE FUNCTION private.create_profile_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app
AS $function$
DECLARE
  candidate text := pg_catalog.lower(pg_catalog.btrim(
    COALESCE(NEW.raw_user_meta_data ->> 'username', '')));
BEGIN
  IF candidate !~ '^[a-z0-9][a-z0-9_.-]{1,39}$' THEN
    candidate := 'user-' || pg_catalog.replace(NEW.id::text, '-', '');
  END IF;

  INSERT INTO app.profiles (user_id, username, display_name)
  VALUES (
    NEW.id,
    candidate,
    pg_catalog.left(COALESCE(
      NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'display_name'), ''),
      candidate), 80)
  );
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.create_profile_for_auth_user() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.create_profile_for_auth_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER auth_user_profile_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.create_profile_for_auth_user();

CREATE FUNCTION private.create_group(p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  new_group_id uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF pg_catalog.length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_group_name' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO app.expense_groups (group_name, created_by)
  VALUES (pg_catalog.btrim(p_name), caller_id)
  RETURNING group_id INTO new_group_id;

  INSERT INTO app.group_memberships (group_id, user_id, member_role)
  VALUES (new_group_id, caller_id, 'OWNER');
  RETURN new_group_id;
END;
$function$;
ALTER FUNCTION private.create_group(text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.create_group(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_group(text) TO authenticated;

CREATE FUNCTION private.require_group_member(p_group_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app
AS $function$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF NOT private.is_active_member(p_group_id, p_user_id) THEN
    RAISE EXCEPTION 'group_access_denied' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;
ALTER FUNCTION private.require_group_member(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.require_group_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.rename_group(p_group_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF p_name IS NULL OR pg_catalog.length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_group_name' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM app.expense_groups WHERE group_id = p_group_id FOR UPDATE;
  IF NOT FOUND OR NOT private.is_group_owner(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'group_owner_required' USING ERRCODE = 'P0001';
  END IF;
  UPDATE app.expense_groups
  SET group_name = pg_catalog.btrim(p_name), updated_at = pg_catalog.clock_timestamp()
  WHERE group_id = p_group_id;
END;
$function$;
ALTER FUNCTION private.rename_group(uuid, text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.rename_group(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rename_group(uuid, text) TO authenticated;

CREATE FUNCTION private.transfer_group_ownership(p_group_id uuid, p_new_owner uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  PERFORM 1 FROM app.expense_groups WHERE group_id = p_group_id FOR UPDATE;
  IF NOT FOUND OR NOT private.is_group_owner(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'group_owner_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_owner IS NULL OR NOT private.is_active_member(p_group_id, p_new_owner) THEN
    RAISE EXCEPTION 'new_owner_must_be_active_member' USING ERRCODE = 'P0001';
  END IF;
  UPDATE app.group_memberships SET member_role = 'MEMBER'
  WHERE group_id = p_group_id AND member_role = 'OWNER' AND removed_at IS NULL;
  UPDATE app.group_memberships SET member_role = 'OWNER'
  WHERE group_id = p_group_id AND user_id = p_new_owner AND removed_at IS NULL;
END;
$function$;
ALTER FUNCTION private.transfer_group_ownership(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.transfer_group_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.transfer_group_ownership(uuid, uuid) TO authenticated;

CREATE FUNCTION private.create_group_invite(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, extensions
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  clear_token text := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  expiry timestamptz := pg_catalog.clock_timestamp() + interval '7 days';
  invite uuid;
BEGIN
  PERFORM 1 FROM app.expense_groups WHERE group_id = p_group_id FOR UPDATE;
  IF NOT FOUND OR NOT private.is_group_owner(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'group_owner_required' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO app.group_invites (group_id, token_hash, created_by, expires_at)
  VALUES (p_group_id, extensions.digest(pg_catalog.convert_to(clear_token, 'UTF8'), 'sha256'), caller_id, expiry)
  RETURNING invite_id INTO invite;
  RETURN pg_catalog.jsonb_build_object(
    'invite_id', invite, 'token', clear_token, 'expires_at', expiry::text
  );
END;
$function$;
ALTER FUNCTION private.create_group_invite(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.create_group_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_group_invite(uuid) TO authenticated;

CREATE FUNCTION private.revoke_group_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE
  invite_group uuid;
  caller_id uuid := auth.uid();
BEGIN
  SELECT group_id INTO invite_group FROM app.group_invites WHERE invite_id = p_invite_id;
  IF invite_group IS NULL THEN RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM app.expense_groups WHERE group_id = invite_group FOR UPDATE;
  UPDATE app.group_invites SET revoked_at = pg_catalog.clock_timestamp()
  WHERE invite_id = p_invite_id AND group_id = invite_group AND revoked_at IS NULL AND accepted_at IS NULL;
  IF NOT FOUND OR NOT private.is_group_owner(invite_group, caller_id) THEN
    RAISE EXCEPTION 'group_owner_required_or_invite_unavailable' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;
ALTER FUNCTION private.revoke_group_invite(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.revoke_group_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.revoke_group_invite(uuid) TO authenticated;

CREATE FUNCTION private.accept_group_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, extensions
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  computed_hash bytea;
  invite_group uuid;
  invite_row app.group_invites%ROWTYPE;
BEGIN
  IF caller_id IS NULL OR p_token IS NULL OR pg_catalog.length(p_token) <> 64 THEN
    RAISE EXCEPTION 'invalid_or_expired_invite' USING ERRCODE = 'P0001';
  END IF;
  computed_hash := extensions.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256');

  SELECT group_id INTO invite_group FROM app.group_invites WHERE group_invites.token_hash = computed_hash;
  IF invite_group IS NULL THEN RAISE EXCEPTION 'invalid_or_expired_invite' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM app.expense_groups WHERE group_id = invite_group FOR UPDATE;
  SELECT * INTO invite_row FROM app.group_invites
  WHERE group_invites.token_hash = computed_hash AND group_id = invite_group FOR UPDATE;

  IF invite_row.accepted_at IS NOT NULL THEN
    IF invite_row.accepted_by = caller_id THEN RETURN invite_group; END IF;
    RAISE EXCEPTION 'invalid_or_expired_invite' USING ERRCODE = 'P0001';
  END IF;
  IF invite_row.revoked_at IS NOT NULL OR invite_row.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'invalid_or_expired_invite' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO app.group_memberships (group_id, user_id, member_role)
  VALUES (invite_group, caller_id, 'MEMBER')
  ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING;
  UPDATE app.group_invites SET accepted_at = pg_catalog.clock_timestamp(), accepted_by = caller_id
  WHERE invite_id = invite_row.invite_id;
  RETURN invite_group;
END;
$function$;
ALTER FUNCTION private.accept_group_invite(text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.accept_group_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.accept_group_invite(text) TO authenticated;

CREATE FUNCTION private.require_person3_hook(p_signature text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF pg_catalog.to_regprocedure(p_signature) IS NULL THEN
    RAISE EXCEPTION 'financial_integration_not_ready' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;
ALTER FUNCTION private.require_person3_hook(text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.require_person3_hook(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.remove_group_member(p_group_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  PERFORM 1 FROM app.expense_groups WHERE group_id = p_group_id FOR UPDATE;
  IF NOT FOUND OR NOT private.is_group_owner(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'group_owner_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_user_id = caller_id THEN RAISE EXCEPTION 'owner_must_transfer_first' USING ERRCODE = 'P0001'; END IF;
  IF NOT private.is_active_member(p_group_id, p_user_id) THEN
    RAISE EXCEPTION 'active_member_not_found' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.assert_member_has_no_active_recurring(p_group_id, p_user_id);
  PERFORM private.require_person3_hook('private.assert_member_can_leave(uuid,uuid)');
  EXECUTE 'SELECT private.assert_member_can_leave($1, $2)' USING p_group_id, p_user_id;
  UPDATE app.group_memberships
  SET removed_at = pg_catalog.clock_timestamp(), removed_by = caller_id
  WHERE group_id = p_group_id AND user_id = p_user_id AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_member_not_found' USING ERRCODE = 'P0001'; END IF;
END;
$function$;
ALTER FUNCTION private.remove_group_member(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.remove_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.remove_group_member(uuid, uuid) TO authenticated;

CREATE FUNCTION private.leave_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  PERFORM 1 FROM app.expense_groups WHERE group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group_access_denied' USING ERRCODE = 'P0001'; END IF;
  IF private.is_group_owner(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'owner_must_transfer_first' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.is_active_member(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'group_access_denied' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.assert_member_has_no_active_recurring(p_group_id, caller_id);
  PERFORM private.require_person3_hook('private.assert_member_can_leave(uuid,uuid)');
  EXECUTE 'SELECT private.assert_member_can_leave($1, $2)' USING p_group_id, caller_id;
  UPDATE app.group_memberships
  SET removed_at = pg_catalog.clock_timestamp(), removed_by = caller_id
  WHERE group_id = p_group_id AND user_id = caller_id AND removed_at IS NULL;
END;
$function$;
ALTER FUNCTION private.leave_group(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.leave_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.leave_group(uuid) TO authenticated;

-- PostgREST surfaces only INVOKER wrappers; security and writes stay in app/private.
CREATE FUNCTION api.create_group(p_name text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
AS $$ SELECT pg_catalog.jsonb_build_object('group_id', private.create_group(p_name)) $$;
CREATE FUNCTION api.rename_group(p_group_id uuid, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $$ BEGIN PERFORM private.rename_group(p_group_id, p_name);
  RETURN pg_catalog.jsonb_build_object('group_id', p_group_id); END $$;
CREATE FUNCTION api.transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $$ BEGIN PERFORM private.transfer_group_ownership(p_group_id, p_new_owner_id);
  RETURN pg_catalog.jsonb_build_object('group_id', p_group_id); END $$;
CREATE FUNCTION api.create_group_invite(p_group_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
AS $$ SELECT private.create_group_invite(p_group_id) $$;
CREATE FUNCTION api.accept_group_invite(p_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
AS $$ SELECT pg_catalog.jsonb_build_object('group_id', private.accept_group_invite(p_token)) $$;
CREATE FUNCTION api.revoke_group_invite(p_invite_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $$ BEGIN PERFORM private.revoke_group_invite(p_invite_id);
  RETURN pg_catalog.jsonb_build_object('invite_id', p_invite_id, 'revoked', true); END $$;
CREATE FUNCTION api.remove_group_member(p_group_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $$ BEGIN PERFORM private.remove_group_member(p_group_id, p_user_id);
  RETURN pg_catalog.jsonb_build_object('group_id', p_group_id, 'user_id', p_user_id, 'removed', true); END $$;
CREATE FUNCTION api.leave_group(p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $$ BEGIN PERFORM private.leave_group(p_group_id);
  RETURN pg_catalog.jsonb_build_object('group_id', p_group_id, 'left', true); END $$;

CREATE FUNCTION api.list_groups(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'group_id', g.group_id, 'group_name', g.group_name,
    'role', gm.member_role, 'created_at', g.created_at::text
  ) ORDER BY g.group_id), '[]'::jsonb)
  FROM (
    SELECT group_id, group_name, created_at
    FROM app.expense_groups
    WHERE private.is_active_member(group_id, auth.uid())
      AND (p_after_id IS NULL OR group_id > p_after_id)
    ORDER BY group_id LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) AS g
  JOIN app.group_memberships AS gm ON gm.group_id = g.group_id
    AND gm.user_id = auth.uid() AND gm.removed_at IS NULL
$$;

CREATE FUNCTION api.get_group(p_group_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'group_id', group_id, 'group_name', group_name,
    'created_by', created_by, 'created_at', created_at::text,
    'role', (SELECT member_role FROM app.group_memberships
      WHERE group_id = p_group_id AND user_id = auth.uid() AND removed_at IS NULL)
  ) FROM app.expense_groups
  WHERE group_id = p_group_id AND private.is_active_member(group_id, auth.uid())
$$;

CREATE FUNCTION api.list_group_members(
  p_group_id uuid, p_after_membership_id uuid DEFAULT NULL, p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(page.item ORDER BY page.membership_id), '[]'::jsonb)
  FROM (
    SELECT gm.membership_id, pg_catalog.jsonb_build_object(
      'membership_id', gm.membership_id,
      'user_id', p.user_id,
      'username', p.username,
      'display_name', p.display_name,
      'role', gm.member_role,
      'joined_at', gm.joined_at::text
    ) AS item
    FROM app.group_memberships AS gm
    JOIN app.profiles AS p ON p.user_id = gm.user_id
    WHERE gm.group_id = p_group_id AND gm.removed_at IS NULL
      AND private.is_active_member(p_group_id, auth.uid())
      AND (p_after_membership_id IS NULL OR gm.membership_id > p_after_membership_id)
    ORDER BY gm.membership_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) AS page
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO authenticated;
