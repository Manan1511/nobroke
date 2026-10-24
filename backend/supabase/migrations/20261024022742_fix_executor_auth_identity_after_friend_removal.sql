-- Later friend and payment migrations added executor-owned SECURITY DEFINER
-- functions after the original auth.uid() compatibility pass.
DO $migration$
DECLARE
  routine record;
BEGIN
  IF pg_catalog.to_regprocedure('private.request_user_id()') IS NULL THEN
    RAISE EXCEPTION 'private.request_user_id() must exist before applying this migration';
  END IF;

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
