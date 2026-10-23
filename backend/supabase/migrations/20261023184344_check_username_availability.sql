-- Return only whether a requested handle can be claimed. The API wrapper is
-- invoker-secure; this narrow helper bypasses profile RLS without revealing
-- the matching profile or account identity.
CREATE OR REPLACE FUNCTION private.check_username_availability(p_username text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $function$
DECLARE
  caller_id uuid := private.request_user_id();
  normalized_username text := pg_catalog.lower(pg_catalog.btrim(p_username));
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF normalized_username IS NULL
      OR normalized_username !~ '^[a-z0-9][a-z0-9_.-]{1,39}$' THEN
    RAISE EXCEPTION 'invalid_profile';
  END IF;
  RETURN NOT EXISTS (
    SELECT 1
    FROM app.profiles AS profile
    WHERE profile.username = normalized_username
      AND profile.user_id <> caller_id
  );
END;
$function$;
ALTER FUNCTION private.check_username_availability(text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.check_username_availability(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.check_username_availability(text) TO authenticated;

CREATE OR REPLACE FUNCTION api.check_username_availability(p_username text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$
  SELECT private.check_username_availability(p_username)
$$;
REVOKE ALL ON FUNCTION api.check_username_availability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.check_username_availability(text) TO authenticated;
