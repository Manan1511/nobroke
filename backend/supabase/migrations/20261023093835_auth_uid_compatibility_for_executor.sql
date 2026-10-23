-- The hosted auth schema is owned by supabase_admin, so the restricted
-- executor role cannot depend on schema-level auth privileges. Read only the
-- verified JWT subject settings that auth.uid() itself uses.
CREATE OR REPLACE FUNCTION private.request_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;
ALTER FUNCTION private.request_user_id() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.request_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.request_user_id() TO nobroke_executor;

-- Replace auth.uid() only inside private SECURITY DEFINER routines owned by
-- the restricted executor. API invokers and RLS policies keep using auth.uid()
-- directly as their authenticated caller already has access to the auth schema.
DO $migration$
DECLARE
  routine record;
BEGIN
  FOR routine IN
    SELECT pg_catalog.pg_get_functiondef(p.oid) AS definition
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proowner = 'nobroke_executor'::regrole
      AND p.prosecdef
      AND p.prosrc LIKE '%auth.uid()%'
  LOOP
    EXECUTE pg_catalog.replace(
      routine.definition,
      'auth.uid()',
      'private.request_user_id()'
    );
  END LOOP;
END;
$migration$;
