-- Restore the restricted RPC owner's ability to call auth.uid(), then make
-- preferred-name onboarding an explicit, persisted profile setup step.
GRANT USAGE ON SCHEMA auth TO nobroke_executor;

ALTER TABLE app.profiles
  ADD COLUMN IF NOT EXISTS name_setup_complete boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.update_my_profile(p_username text, p_display_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  normalized_username text := pg_catalog.lower(pg_catalog.btrim(p_username));
  normalized_display_name text := pg_catalog.btrim(p_display_name);
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF normalized_username !~ '^[a-z0-9][a-z0-9_.-]{1,39}$'
      OR pg_catalog.length(normalized_display_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_profile';
  END IF;
  BEGIN
    UPDATE app.profiles
    SET username = normalized_username,
        display_name = normalized_display_name,
        name_setup_complete = true
    WHERE user_id = caller_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'username_unavailable';
  END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'user_id', caller_id,
    'username', normalized_username,
    'display_name', normalized_display_name,
    'name_setup_complete', true
  );
END;
$function$;
ALTER FUNCTION private.update_my_profile(text, text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.update_my_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.update_my_profile(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION api.get_my_profile()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, app, auth
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'user_id', p.user_id,
    'username', p.username,
    'display_name', p.display_name,
    'name_setup_complete', p.name_setup_complete
  )
  FROM app.profiles AS p
  WHERE p.user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION api.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_my_profile() TO authenticated;

REVOKE ALL ON FUNCTION api.update_my_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.update_my_profile(text, text) TO authenticated;
