-- Later migrations introduced new executor-owned SECURITY DEFINER routines
-- after the auth.uid compatibility pass. Keep those routines independent of
-- schema-level access to Supabase's protected auth schema.
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
