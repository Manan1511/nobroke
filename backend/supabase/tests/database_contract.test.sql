BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(18);

SELECT extensions.has_schema('api', 'PostgREST API schema exists');
SELECT extensions.has_schema('app', 'application tables use a non-exposed schema');
SELECT extensions.has_schema('private', 'privileged helpers use a private schema');
SELECT extensions.has_table('app', 'expense_groups', 'groups are persisted');
SELECT extensions.has_table('app', 'expenses', 'expense ledger exists');
SELECT extensions.has_table('app', 'user_private_financials', 'income bands have a private table');
SELECT extensions.hasnt_column('app', 'user_private_financials', 'monthly_income', 'raw monthly income is never stored');
SELECT extensions.ok(
  NOT has_table_privilege('authenticated', 'app.user_private_financials', 'SELECT'),
  'authenticated users cannot read private financials'
);
SELECT extensions.ok(
  (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'app.user_private_financials'::regclass),
  'private financials have row-level security enabled'
);
SELECT extensions.ok(
  (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'app.user_private_financials'::regclass),
  'private financials force row-level security'
);
SELECT extensions.ok(
  pg_catalog.pg_has_role('postgres', 'nobroke_executor', 'MEMBER'),
  'hosted migration role can assign functions to the restricted owner role'
);
SELECT extensions.ok(
  has_function_privilege('nobroke_executor', 'private.request_user_id()', 'EXECUTE'),
  'restricted RPC owner can resolve the authenticated JWT identity'
);
SELECT extensions.ok(
  has_schema_privilege('nobroke_executor', 'private', 'CREATE'),
  'restricted owner can own functions in the private schema'
);
SELECT extensions.ok(
  NOT (SELECT prosecdef FROM pg_catalog.pg_proc
       WHERE oid = 'api.create_expense(uuid,text,numeric,text,uuid,uuid[],uuid,jsonb)'::regprocedure),
  'browser-facing expense RPC uses invoker security'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'api'
     AND (p.proconfig IS NULL OR NOT EXISTS (
       SELECT 1
       FROM unnest(p.proconfig) AS configured(setting)
       WHERE configured.setting ~ '^search_path=pg_catalog(, (private|auth|app|extensions|pg_temp))*$'
         AND configured.setting !~ ', pg_temp,'
     ))),
  0,
  'all api RPCs use a fixed safe search path rooted at pg_catalog'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'api' AND p.prosecdef),
  0,
  'all api-schema RPCs use invoker security'
);
SELECT extensions.ok(
  EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
          WHERE r.rolname = 'authenticator'
            AND r.rolconfig @> ARRAY['pgrst.db_schemas=api, public, graphql_public']),
  'the Data API exposes the versioned api schema'
);
SELECT extensions.ok(
  NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nobroke-recurring-bills'),
  'recurring worker waits for Person 3 hosted integration'
);

SELECT * FROM extensions.finish();
ROLLBACK;
