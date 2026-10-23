-- New SECURITY DEFINER routines must read the verified JWT subject through
-- the same compatibility helper used by the existing restricted executor.
-- The executor cannot access Supabase's protected auth schema directly.
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
      AND p.proname IN (
        'create_or_reuse_global_settlement_preview',
        'cancel_global_settlement_plan'
      )
  LOOP
    EXECUTE pg_catalog.replace(
      routine.definition,
      'auth.uid()',
      'private.request_user_id()'
    );
  END LOOP;
END;
$migration$;
