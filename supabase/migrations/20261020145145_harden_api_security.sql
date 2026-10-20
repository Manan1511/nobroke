-- Pin the PostgREST schema list in version control. This is the documented
-- manual override for the Dashboard's Exposed Schemas setting.
ALTER ROLE authenticator SET pgrst.db_schemas = 'api, public, graphql_public';
NOTIFY pgrst, 'reload config';

-- API wrappers are invokers, and every one receives a fixed search path so a
-- caller cannot shadow built-ins or trusted helpers with a writable schema.
ALTER FUNCTION api.accept_group_invite(text)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.clear_private_income()
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.create_expense(uuid, text, numeric, text, uuid, uuid[], uuid, jsonb)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.create_group(text)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.create_group_invite(uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.create_recurring_template(uuid, text, numeric, text, text, date, uuid, uuid[], jsonb)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.get_expense(uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.get_group(uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.get_private_income_status()
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.get_recurring_template(uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.leave_group(uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.list_expenses(uuid, uuid, integer)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.list_group_members(uuid, uuid, integer)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.list_groups(uuid, integer)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.list_recurring_billing_runs(uuid, bigint, integer)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.list_recurring_templates(uuid, uuid, integer)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.pause_recurring_template(uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.remove_group_member(uuid, uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.rename_group(uuid, text)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.replace_expense(uuid, text, uuid, text, numeric, text, uuid, uuid[], uuid, jsonb)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.resume_recurring_template(uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.revoke_group_invite(uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.set_private_income(numeric)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.transfer_group_ownership(uuid, uuid)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.update_recurring_template(uuid, text, numeric, text, text, uuid, uuid[], jsonb)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;
ALTER FUNCTION api.void_expense(uuid, text)
  SET search_path = pg_catalog, private, auth, app, extensions, pg_temp;

-- RLS policies use init-plan evaluation for the request identity, rather than
-- recomputing auth.uid() for each row.
DROP POLICY expenses_group_members_read ON app.expenses;
CREATE POLICY expenses_group_members_read ON app.expenses FOR SELECT TO authenticated
  USING (private.is_active_member(group_id, (SELECT auth.uid())));
DROP POLICY expense_splits_group_members_read ON app.expense_splits;
CREATE POLICY expense_splits_group_members_read ON app.expense_splits FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.expenses AS e
    WHERE e.expense_id = expense_splits.expense_id
      AND private.is_active_member(e.group_id, (SELECT auth.uid()))
  ));
DROP POLICY expense_audit_group_members_read ON app.expense_audit;
CREATE POLICY expense_audit_group_members_read ON app.expense_audit FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.expenses AS e
    WHERE e.expense_id = expense_audit.expense_id
      AND private.is_active_member(e.group_id, (SELECT auth.uid()))
  ));
DROP POLICY recurring_templates_group_read ON app.recurring_templates;
CREATE POLICY recurring_templates_group_read ON app.recurring_templates FOR SELECT TO authenticated
  USING (private.is_active_member(group_id, (SELECT auth.uid())));
DROP POLICY recurring_versions_group_read ON app.recurring_template_versions;
CREATE POLICY recurring_versions_group_read ON app.recurring_template_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_template_versions.template_id
      AND private.is_active_member(t.group_id, (SELECT auth.uid()))
  ));
DROP POLICY recurring_participants_group_read ON app.recurring_template_version_participants;
CREATE POLICY recurring_participants_group_read ON app.recurring_template_version_participants FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_template_version_participants.template_id
      AND private.is_active_member(t.group_id, (SELECT auth.uid()))
  ));
DROP POLICY recurring_pauses_group_read ON app.recurring_template_pauses;
CREATE POLICY recurring_pauses_group_read ON app.recurring_template_pauses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_template_pauses.template_id
      AND private.is_active_member(t.group_id, (SELECT auth.uid()))
  ));
DROP POLICY recurring_events_group_read ON app.recurring_template_events;
CREATE POLICY recurring_events_group_read ON app.recurring_template_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_template_events.template_id
      AND private.is_active_member(t.group_id, (SELECT auth.uid()))
  ));
DROP POLICY recurring_runs_group_read ON app.recurring_billing_runs;
CREATE POLICY recurring_runs_group_read ON app.recurring_billing_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_billing_runs.template_id
      AND private.is_active_member(t.group_id, (SELECT auth.uid()))
  ));

-- Cover foreign keys used by referential checks and common per-user lookups.
CREATE INDEX IF NOT EXISTS expense_audit_actor_user_idx ON app.expense_audit (actor_user_id);
CREATE INDEX IF NOT EXISTS expense_groups_created_by_idx ON app.expense_groups (created_by);
CREATE INDEX IF NOT EXISTS expenses_paid_by_idx ON app.expenses (paid_by);
CREATE INDEX IF NOT EXISTS expenses_replaced_by_idx ON app.expenses (replaced_by_expense_id);
CREATE INDEX IF NOT EXISTS expenses_voided_by_idx ON app.expenses (voided_by);
CREATE INDEX IF NOT EXISTS group_invites_accepted_by_idx ON app.group_invites (accepted_by);
CREATE INDEX IF NOT EXISTS group_invites_created_by_idx ON app.group_invites (created_by);
CREATE INDEX IF NOT EXISTS group_memberships_removed_by_idx ON app.group_memberships (removed_by);
CREATE INDEX IF NOT EXISTS recurring_billing_runs_expense_id_idx ON app.recurring_billing_runs (expense_id);
CREATE INDEX IF NOT EXISTS recurring_template_events_actor_user_idx ON app.recurring_template_events (actor_user_id);
CREATE INDEX IF NOT EXISTS recurring_template_pauses_paused_by_idx ON app.recurring_template_pauses (paused_by);
CREATE INDEX IF NOT EXISTS recurring_template_pauses_resumed_by_idx ON app.recurring_template_pauses (resumed_by);
CREATE INDEX IF NOT EXISTS recurring_template_versions_created_by_idx ON app.recurring_template_versions (created_by);
CREATE INDEX IF NOT EXISTS recurring_template_versions_paid_by_idx ON app.recurring_template_versions (paid_by);
CREATE INDEX IF NOT EXISTS recurring_templates_created_by_idx ON app.recurring_templates (created_by);
CREATE INDEX IF NOT EXISTS recurring_templates_current_version_idx
  ON app.recurring_templates (template_id, current_version_no);
CREATE INDEX IF NOT EXISTS recurring_templates_paid_by_idx ON app.recurring_templates (paid_by);
