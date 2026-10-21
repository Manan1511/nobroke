-- Versioned recurring schedules. Occurrences are generated only by the
-- protected SQL worker; manual callers can never post a recurring expense.

CREATE TABLE app.recurring_templates (
  template_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES app.expense_groups (group_id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  paid_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  current_version_no integer NOT NULL CHECK (current_version_no > 0),
  next_run_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  paused_at timestamptz,
  last_success_at timestamptz,
  last_success_date date,
  failed_date date,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK ((is_active AND paused_at IS NULL) OR (NOT is_active AND paused_at IS NOT NULL))
);
CREATE INDEX recurring_templates_due ON app.recurring_templates (next_run_date, template_id)
  WHERE is_active;
CREATE INDEX recurring_templates_group_cursor ON app.recurring_templates (group_id, template_id);

CREATE TABLE app.recurring_template_versions (
  template_id uuid NOT NULL REFERENCES app.recurring_templates (template_id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  effective_from date NOT NULL,
  effective_to date,
  title text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(title)) BETWEEN 1 AND 120),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount > 0),
  split_mode text NOT NULL CHECK (split_mode IN ('EQUAL', 'EXACT', 'INCOME_RATIO')),
  frequency text NOT NULL CHECK (frequency IN ('WEEKLY', 'MONTHLY', 'YEARLY')),
  anchor_date date NOT NULL,
  paid_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (template_id, version_no)
);
CREATE INDEX recurring_template_versions_effective
  ON app.recurring_template_versions (template_id, effective_from DESC, version_no DESC);
ALTER TABLE app.recurring_templates
  ADD CONSTRAINT recurring_templates_current_version_fk
  FOREIGN KEY (template_id, current_version_no)
  REFERENCES app.recurring_template_versions (template_id, version_no)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE app.recurring_template_version_participants (
  template_id uuid NOT NULL,
  version_no integer NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  fixed_share numeric(12,2) CHECK (fixed_share >= 0),
  PRIMARY KEY (template_id, version_no, user_id),
  FOREIGN KEY (template_id, version_no)
    REFERENCES app.recurring_template_versions (template_id, version_no) ON DELETE RESTRICT
);
CREATE INDEX recurring_template_participant_user
  ON app.recurring_template_version_participants (user_id, template_id, version_no);

CREATE TABLE app.recurring_template_pauses (
  pause_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES app.recurring_templates (template_id) ON DELETE RESTRICT,
  paused_on date NOT NULL,
  resumed_on date,
  paused_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  resumed_by uuid REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK ((resumed_on IS NULL) = (resumed_by IS NULL)),
  CHECK (resumed_on IS NULL OR resumed_on >= paused_on)
);
CREATE UNIQUE INDEX recurring_template_one_open_pause
  ON app.recurring_template_pauses (template_id) WHERE resumed_on IS NULL;
CREATE INDEX recurring_template_pause_dates ON app.recurring_template_pauses
  (template_id, paused_on, resumed_on);

CREATE TABLE app.recurring_template_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES app.recurring_templates (template_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'CREATED', 'UPDATED', 'PAUSED', 'RESUMED', 'BILLING_SUCCESS', 'BILLING_SKIPPED', 'BILLING_FAILED'
  )),
  effective_date date,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE RESTRICT,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX recurring_template_events_cursor ON app.recurring_template_events
  (template_id, event_id DESC);

CREATE TABLE app.recurring_billing_runs (
  run_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES app.recurring_templates (template_id) ON DELETE RESTRICT,
  billing_cycle_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED')),
  expense_id uuid REFERENCES app.expenses (expense_id) ON DELETE RESTRICT,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  finished_at timestamptz,
  UNIQUE (template_id, billing_cycle_date),
  CHECK ((status = 'SUCCESS' AND expense_id IS NOT NULL AND error_code IS NULL)
    OR (status = 'FAILED' AND expense_id IS NULL AND error_code IS NOT NULL)
    OR (status = 'SKIPPED' AND expense_id IS NULL AND error_code IS NULL))
);
CREATE INDEX recurring_billing_runs_cursor ON app.recurring_billing_runs
  (template_id, run_id DESC);

ALTER TABLE app.expenses
  ADD CONSTRAINT expenses_source_template_fk
  FOREIGN KEY (source_template_id) REFERENCES app.recurring_templates (template_id) ON DELETE RESTRICT;

ALTER TABLE app.recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recurring_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recurring_template_version_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recurring_template_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recurring_template_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recurring_billing_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_templates_executor ON app.recurring_templates TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY recurring_versions_executor ON app.recurring_template_versions TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY recurring_participants_executor ON app.recurring_template_version_participants TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY recurring_pauses_executor ON app.recurring_template_pauses TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY recurring_events_executor ON app.recurring_template_events TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY recurring_runs_executor ON app.recurring_billing_runs TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY recurring_templates_group_read ON app.recurring_templates FOR SELECT TO authenticated
  USING (private.is_active_member(group_id, auth.uid()));
CREATE POLICY recurring_versions_group_read ON app.recurring_template_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_template_versions.template_id
      AND private.is_active_member(t.group_id, auth.uid())
  ));
CREATE POLICY recurring_participants_group_read ON app.recurring_template_version_participants FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_template_version_participants.template_id
      AND private.is_active_member(t.group_id, auth.uid())
  ));
CREATE POLICY recurring_pauses_group_read ON app.recurring_template_pauses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_template_pauses.template_id
      AND private.is_active_member(t.group_id, auth.uid())
  ));
CREATE POLICY recurring_events_group_read ON app.recurring_template_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_template_events.template_id
      AND private.is_active_member(t.group_id, auth.uid())
  ));
CREATE POLICY recurring_runs_group_read ON app.recurring_billing_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = recurring_billing_runs.template_id
      AND private.is_active_member(t.group_id, auth.uid())
  ));
GRANT SELECT ON app.recurring_templates, app.recurring_template_versions,
  app.recurring_template_version_participants, app.recurring_template_pauses,
  app.recurring_template_events, app.recurring_billing_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.recurring_templates TO nobroke_executor;
GRANT SELECT, INSERT, UPDATE ON app.recurring_template_versions TO nobroke_executor;
GRANT SELECT, INSERT ON app.recurring_template_version_participants,
  app.recurring_template_events TO nobroke_executor;
GRANT SELECT, INSERT, UPDATE ON app.recurring_template_pauses,
  app.recurring_billing_runs TO nobroke_executor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO nobroke_executor;

CREATE FUNCTION private.billing_date()
RETURNS date
LANGUAGE sql VOLATILE
SET search_path = pg_catalog
AS $$ SELECT (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date $$;
ALTER FUNCTION private.billing_date() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.billing_date() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.next_recurring_date(p_anchor date, p_frequency text, p_cycle_date date)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  target_month date;
  last_day date;
  target_year integer;
  anchor_month integer;
  anchor_day integer;
BEGIN
  IF p_anchor IS NULL OR p_cycle_date IS NULL THEN
    RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = 'P0001';
  END IF;
  IF p_frequency = 'WEEKLY' THEN
    RETURN p_cycle_date + 7;
  ELSIF p_frequency = 'MONTHLY' THEN
    target_month := (pg_catalog.date_trunc('month', p_cycle_date::timestamp) + interval '1 month')::date;
    last_day := (pg_catalog.date_trunc('month', target_month::timestamp) + interval '1 month - 1 day')::date;
    RETURN pg_catalog.make_date(
      EXTRACT(year FROM target_month)::integer,
      EXTRACT(month FROM target_month)::integer,
      LEAST(EXTRACT(day FROM p_anchor)::integer,
        EXTRACT(day FROM last_day)::integer)
    );
  ELSIF p_frequency = 'YEARLY' THEN
    target_year := EXTRACT(year FROM p_cycle_date)::integer + 1;
    anchor_month := EXTRACT(month FROM p_anchor)::integer;
    anchor_day := EXTRACT(day FROM p_anchor)::integer;
    target_month := pg_catalog.make_date(target_year, anchor_month, 1);
    last_day := (pg_catalog.date_trunc('month', target_month::timestamp) + interval '1 month - 1 day')::date;
    RETURN pg_catalog.make_date(target_year, anchor_month, LEAST(anchor_day,
      EXTRACT(day FROM last_day)::integer));
  END IF;
  RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = 'P0001';
END;
$function$;
ALTER FUNCTION private.next_recurring_date(date, text, date) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.next_recurring_date(date, text, date) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.can_manage_recurring(p_template_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    WHERE t.template_id = p_template_id
      AND private.is_active_member(t.group_id, p_user_id)
      AND (t.created_by = p_user_id OR t.paid_by = p_user_id
        OR private.is_group_owner(t.group_id, p_user_id))
  )
$$;
ALTER FUNCTION private.can_manage_recurring(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.can_manage_recurring(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_recurring(uuid, uuid) TO authenticated;

CREATE FUNCTION private.assert_member_has_no_active_recurring(p_group_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.recurring_templates AS t
    JOIN app.recurring_template_versions AS v
      ON v.template_id = t.template_id
      AND (v.effective_to IS NULL OR v.effective_to >= t.next_run_date)
    WHERE t.group_id = p_group_id AND t.is_active
      AND (v.paid_by = p_user_id OR EXISTS (
        SELECT 1 FROM app.recurring_template_version_participants AS p
        WHERE p.template_id = v.template_id AND p.version_no = v.version_no
          AND p.user_id = p_user_id
      ))
  ) THEN
    RAISE EXCEPTION 'active_recurring_bills_block_departure' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;
ALTER FUNCTION private.assert_member_has_no_active_recurring(uuid, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.assert_member_has_no_active_recurring(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.create_recurring_template_for_request(
  p_group_id uuid,
  p_title text,
  p_total_amount numeric,
  p_split_mode text,
  p_frequency text,
  p_start_date date,
  p_paid_by uuid,
  p_participants uuid[],
  p_exact_shares jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  template_id uuid;
  participant_id uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM app.expense_groups WHERE group_id = p_group_id FOR UPDATE;
  IF NOT FOUND OR NOT private.is_active_member(p_group_id, caller_id) THEN
    RAISE EXCEPTION 'group_access_denied' USING ERRCODE = 'P0001';
  END IF;
  IF p_frequency IS NULL OR p_frequency NOT IN ('WEEKLY', 'MONTHLY', 'YEARLY') THEN
    RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = 'P0001';
  END IF;
  IF p_title IS NULL OR pg_catalog.length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_template_title' USING ERRCODE = 'P0001';
  END IF;
  IF p_start_date IS NULL THEN RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = 'P0001'; END IF;
  IF NOT private.is_active_member(p_group_id, p_paid_by) THEN
    RAISE EXCEPTION 'payer_must_be_active_group_member' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM private.calculate_expense_shares(
    p_group_id, p_total_amount, pg_catalog.upper(p_split_mode), p_participants, p_exact_shares
  );

  INSERT INTO app.recurring_templates (
    group_id, created_by, paid_by, current_version_no, next_run_date
  ) VALUES (p_group_id, caller_id, p_paid_by, 1, p_start_date)
  RETURNING recurring_templates.template_id INTO template_id;
  INSERT INTO app.recurring_template_versions (
    template_id, version_no, effective_from, title, total_amount,
    split_mode, frequency, anchor_date, paid_by, created_by
  ) VALUES (
    template_id, 1, p_start_date, pg_catalog.btrim(p_title), p_total_amount::numeric(12,2),
    pg_catalog.upper(p_split_mode), p_frequency, p_start_date, p_paid_by, caller_id
  );
  FOR participant_id IN SELECT pg_catalog.unnest(p_participants) LOOP
    INSERT INTO app.recurring_template_version_participants (
      template_id, version_no, user_id, fixed_share
    ) VALUES (
      template_id, 1, participant_id,
      CASE WHEN pg_catalog.upper(p_split_mode) = 'EXACT'
        THEN (p_exact_shares ->> participant_id::text)::numeric(12,2) ELSE NULL END
    );
  END LOOP;
  INSERT INTO app.recurring_template_events (template_id, event_type, effective_date, actor_user_id)
  VALUES (template_id, 'CREATED', p_start_date, caller_id);
  RETURN template_id;
END;
$function$;
ALTER FUNCTION private.create_recurring_template_for_request(uuid, text, numeric, text, text, date, uuid, uuid[], jsonb)
  OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.create_recurring_template_for_request(uuid, text, numeric, text, text, date, uuid, uuid[], jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_recurring_template_for_request(uuid, text, numeric, text, text, date, uuid, uuid[], jsonb)
  TO authenticated;

CREATE FUNCTION private.update_recurring_template_for_request(
  p_template_id uuid,
  p_title text,
  p_total_amount numeric,
  p_split_mode text,
  p_frequency text,
  p_paid_by uuid,
  p_participants uuid[],
  p_exact_shares jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  target_group_id uuid;
  template_row app.recurring_templates%ROWTYPE;
  current_version app.recurring_template_versions%ROWTYPE;
  version_row app.recurring_template_versions%ROWTYPE;
  effective_date date;
  new_version_no integer;
  participant_id uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT t.group_id INTO target_group_id FROM app.recurring_templates AS t WHERE t.template_id = p_template_id;
  IF target_group_id IS NULL THEN RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM app.expense_groups AS g WHERE g.group_id = target_group_id FOR UPDATE;
  SELECT * INTO template_row FROM app.recurring_templates WHERE template_id = p_template_id FOR UPDATE;
  IF NOT private.can_manage_recurring(p_template_id, caller_id) THEN
    RAISE EXCEPTION 'template_manager_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_frequency IS NULL OR p_frequency NOT IN ('WEEKLY', 'MONTHLY', 'YEARLY') THEN
    RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = 'P0001';
  END IF;
  IF p_title IS NULL OR pg_catalog.length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_template_title' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.is_active_member(template_row.group_id, p_paid_by) THEN
    RAISE EXCEPTION 'payer_must_be_active_group_member' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM private.calculate_expense_shares(
    template_row.group_id, p_total_amount, pg_catalog.upper(p_split_mode), p_participants, p_exact_shares
  );

  SELECT * INTO current_version FROM app.recurring_template_versions
  WHERE template_id = p_template_id AND version_no = template_row.current_version_no;
  effective_date := template_row.next_run_date;
  LOOP
    SELECT * INTO version_row FROM app.recurring_template_versions AS v
    WHERE v.template_id = p_template_id
      AND v.effective_from <= effective_date
      AND (v.effective_to IS NULL OR effective_date <= v.effective_to)
    ORDER BY v.version_no DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'template_version_missing' USING ERRCODE = 'P0001'; END IF;
    EXIT WHEN effective_date > private.billing_date();
    effective_date := private.next_recurring_date(
      version_row.anchor_date, version_row.frequency, effective_date
    );
  END LOOP;

  new_version_no := template_row.current_version_no + 1;
  UPDATE app.recurring_template_versions SET effective_to = effective_date - 1
  WHERE template_id = p_template_id AND version_no = template_row.current_version_no;
  INSERT INTO app.recurring_template_versions (
    template_id, version_no, effective_from, title, total_amount,
    split_mode, frequency, anchor_date, paid_by, created_by
  ) VALUES (
    p_template_id, new_version_no, effective_date, pg_catalog.btrim(p_title),
    p_total_amount::numeric(12,2), pg_catalog.upper(p_split_mode), p_frequency,
    current_version.anchor_date, p_paid_by, caller_id
  );
  FOR participant_id IN SELECT pg_catalog.unnest(p_participants) LOOP
    INSERT INTO app.recurring_template_version_participants (
      template_id, version_no, user_id, fixed_share
    ) VALUES (
      p_template_id, new_version_no, participant_id,
      CASE WHEN pg_catalog.upper(p_split_mode) = 'EXACT'
        THEN (p_exact_shares ->> participant_id::text)::numeric(12,2) ELSE NULL END
    );
  END LOOP;
  UPDATE app.recurring_templates SET current_version_no = new_version_no,
    paid_by = p_paid_by, updated_at = pg_catalog.clock_timestamp()
  WHERE template_id = p_template_id;
  INSERT INTO app.recurring_template_events (template_id, event_type, effective_date, actor_user_id)
  VALUES (p_template_id, 'UPDATED', effective_date, caller_id);
  RETURN pg_catalog.jsonb_build_object('template_id', p_template_id,
    'version_no', new_version_no, 'effective_from', effective_date::text);
END;
$function$;
ALTER FUNCTION private.update_recurring_template_for_request(uuid, text, numeric, text, text, uuid, uuid[], jsonb)
  OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.update_recurring_template_for_request(uuid, text, numeric, text, text, uuid, uuid[], jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.update_recurring_template_for_request(uuid, text, numeric, text, text, uuid, uuid[], jsonb)
  TO authenticated;

CREATE FUNCTION private.set_recurring_template_paused(p_template_id uuid, p_paused boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  target_group_id uuid;
  template_row app.recurring_templates%ROWTYPE;
  current_version app.recurring_template_versions%ROWTYPE;
  participants uuid[];
  effective_pause_date date := private.billing_date();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT t.group_id INTO target_group_id FROM app.recurring_templates AS t WHERE t.template_id = p_template_id;
  IF target_group_id IS NULL THEN RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM app.expense_groups AS g WHERE g.group_id = target_group_id FOR UPDATE;
  SELECT * INTO template_row FROM app.recurring_templates WHERE template_id = p_template_id FOR UPDATE;
  IF NOT private.can_manage_recurring(p_template_id, caller_id) THEN
    RAISE EXCEPTION 'template_manager_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_paused AND NOT template_row.is_active THEN
    RETURN pg_catalog.jsonb_build_object('template_id', p_template_id, 'is_active', false);
  ELSIF NOT p_paused AND template_row.is_active THEN
    RETURN pg_catalog.jsonb_build_object('template_id', p_template_id, 'is_active', true);
  END IF;

  SELECT * INTO current_version FROM app.recurring_template_versions
  WHERE template_id = p_template_id AND version_no = template_row.current_version_no;
  IF p_paused THEN
    INSERT INTO app.recurring_template_pauses (template_id, paused_on, paused_by)
    VALUES (p_template_id, effective_pause_date, caller_id);
    UPDATE app.recurring_templates SET is_active = false,
      paused_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    WHERE template_id = p_template_id;
    INSERT INTO app.recurring_template_events (template_id, event_type, effective_date, actor_user_id)
    VALUES (p_template_id, 'PAUSED', effective_pause_date, caller_id);
  ELSE
    IF NOT private.is_active_member(template_row.group_id, current_version.paid_by) THEN
      RAISE EXCEPTION 'payer_must_be_active_group_member' USING ERRCODE = 'P0001';
    END IF;
    SELECT pg_catalog.array_agg(p.user_id ORDER BY p.user_id)
      INTO participants
    FROM app.recurring_template_version_participants AS p
    WHERE p.template_id = p_template_id AND p.version_no = current_version.version_no;
    PERFORM 1 FROM private.calculate_expense_shares(
      template_row.group_id, current_version.total_amount, current_version.split_mode,
      participants, CASE WHEN current_version.split_mode = 'EXACT' THEN (
        SELECT pg_catalog.jsonb_object_agg(p.user_id::text, p.fixed_share::text ORDER BY p.user_id)
        FROM app.recurring_template_version_participants AS p
        WHERE p.template_id = p_template_id AND p.version_no = current_version.version_no
      ) ELSE NULL END
    );
    UPDATE app.recurring_template_pauses SET resumed_on = effective_pause_date, resumed_by = caller_id
    WHERE template_id = p_template_id AND resumed_on IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'template_pause_history_missing' USING ERRCODE = 'P0001'; END IF;
    UPDATE app.recurring_templates SET is_active = true, paused_at = NULL,
      updated_at = pg_catalog.clock_timestamp()
    WHERE template_id = p_template_id;
    INSERT INTO app.recurring_template_events (template_id, event_type, effective_date, actor_user_id)
    VALUES (p_template_id, 'RESUMED', effective_pause_date, caller_id);
  END IF;
  RETURN pg_catalog.jsonb_build_object('template_id', p_template_id, 'is_active', NOT p_paused);
END;
$function$;
ALTER FUNCTION private.set_recurring_template_paused(uuid, boolean) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.set_recurring_template_paused(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_recurring_template_paused(uuid, boolean) TO authenticated;

CREATE FUNCTION private.recurring_backlog_count(p_template_id uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $function$
DECLARE
  template_row app.recurring_templates%ROWTYPE;
  version_row app.recurring_template_versions%ROWTYPE;
  due_date date;
  total integer := 0;
  today date := private.billing_date();
BEGIN
  SELECT * INTO template_row FROM app.recurring_templates WHERE template_id = p_template_id;
  IF NOT FOUND OR NOT template_row.is_active OR template_row.next_run_date > today THEN RETURN 0; END IF;
  due_date := template_row.next_run_date;
  WHILE due_date <= today LOOP
    SELECT * INTO version_row FROM app.recurring_template_versions AS v
    WHERE v.template_id = p_template_id AND v.effective_from <= due_date
      AND (v.effective_to IS NULL OR due_date <= v.effective_to)
    ORDER BY v.version_no DESC LIMIT 1;
    IF NOT FOUND THEN EXIT; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM app.recurring_template_pauses AS p
      WHERE p.template_id = p_template_id AND due_date >= p.paused_on
        AND (p.resumed_on IS NULL OR due_date < p.resumed_on)
    ) THEN total := total + 1; END IF;
    due_date := private.next_recurring_date(version_row.anchor_date, version_row.frequency, due_date);
  END LOOP;
  RETURN total;
END;
$function$;
ALTER FUNCTION private.recurring_backlog_count(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.recurring_backlog_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.recurring_backlog_count(uuid) TO authenticated;

CREATE FUNCTION private.process_due_recurring_bills(p_max_occurrences integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  today date := private.billing_date();
  batch_limit integer := LEAST(GREATEST(COALESCE(p_max_occurrences, 50), 1), 50);
  processed integer := 0;
  blocked_templates uuid[] := ARRAY[]::uuid[];
  candidate record;
  template_row app.recurring_templates%ROWTYPE;
  version_row app.recurring_template_versions%ROWTYPE;
  participant_ids uuid[];
  exact_shares jsonb;
  due_date date;
  next_date date;
  new_expense_id uuid;
  error_message text;
  safe_error_code text;
BEGIN
  WHILE processed < batch_limit LOOP
    SELECT t.template_id, t.group_id INTO candidate
    FROM app.recurring_templates AS t
    WHERE t.is_active AND t.next_run_date <= today
      AND NOT (t.template_id = ANY (blocked_templates))
    ORDER BY t.next_run_date, t.template_id
    LIMIT 1;
    IF NOT FOUND THEN EXIT; END IF;

    -- Shared lock order: group first, then template. Membership changes and
    -- template edits take the same locks before touching schedule state.
    PERFORM 1 FROM app.expense_groups AS g WHERE g.group_id = candidate.group_id FOR UPDATE;
    SELECT * INTO template_row FROM app.recurring_templates AS t
    WHERE t.template_id = candidate.template_id FOR UPDATE;
    IF NOT FOUND OR NOT template_row.is_active OR template_row.next_run_date > today THEN
      CONTINUE;
    END IF;
    due_date := template_row.next_run_date;
    processed := processed + 1;

    BEGIN
      SELECT * INTO version_row FROM app.recurring_template_versions AS v
      WHERE v.template_id = template_row.template_id AND v.effective_from <= due_date
        AND (v.effective_to IS NULL OR due_date <= v.effective_to)
      ORDER BY v.version_no DESC LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION 'template_version_missing' USING ERRCODE = 'P0001'; END IF;

      next_date := private.next_recurring_date(version_row.anchor_date, version_row.frequency, due_date);
      IF EXISTS (
        SELECT 1 FROM app.recurring_template_pauses AS p
        WHERE p.template_id = template_row.template_id AND due_date >= p.paused_on
          AND (p.resumed_on IS NULL OR due_date < p.resumed_on)
      ) THEN
        INSERT INTO app.recurring_billing_runs (
          template_id, billing_cycle_date, status, expense_id, error_code, finished_at
        ) VALUES (template_row.template_id, due_date, 'SKIPPED', NULL, NULL, pg_catalog.clock_timestamp())
        ON CONFLICT (template_id, billing_cycle_date) DO UPDATE
          SET status = 'SKIPPED', expense_id = NULL, error_code = NULL,
              started_at = pg_catalog.clock_timestamp(), finished_at = pg_catalog.clock_timestamp();
        UPDATE app.recurring_templates SET next_run_date = next_date,
          failed_date = NULL, last_error_code = NULL, updated_at = pg_catalog.clock_timestamp()
        WHERE template_id = template_row.template_id;
        INSERT INTO app.recurring_template_events (template_id, event_type, effective_date)
        VALUES (template_row.template_id, 'BILLING_SKIPPED', due_date);
      ELSE
        SELECT pg_catalog.array_agg(p.user_id ORDER BY p.user_id) INTO participant_ids
        FROM app.recurring_template_version_participants AS p
        WHERE p.template_id = template_row.template_id AND p.version_no = version_row.version_no;
        IF version_row.split_mode = 'EXACT' THEN
          SELECT pg_catalog.jsonb_object_agg(p.user_id::text, p.fixed_share::text ORDER BY p.user_id)
            INTO exact_shares
          FROM app.recurring_template_version_participants AS p
          WHERE p.template_id = template_row.template_id AND p.version_no = version_row.version_no;
        ELSE
          exact_shares := NULL;
        END IF;
        new_expense_id := private.create_expense_core(
          template_row.group_id, version_row.title, version_row.total_amount,
          version_row.split_mode, version_row.paid_by, participant_ids, exact_shares,
          template_row.created_by,
          pg_catalog.md5(template_row.template_id::text || ':' || due_date::text)::uuid,
          'RECURRING', template_row.template_id, due_date, NULL,
          'recurring:' || template_row.template_id::text || ':' || due_date::text,
          NULL
        );
        INSERT INTO app.recurring_billing_runs (
          template_id, billing_cycle_date, status, expense_id, error_code, finished_at
        ) VALUES (template_row.template_id, due_date, 'SUCCESS', new_expense_id, NULL, pg_catalog.clock_timestamp())
        ON CONFLICT (template_id, billing_cycle_date) DO UPDATE
          SET status = 'SUCCESS', expense_id = EXCLUDED.expense_id, error_code = NULL,
              started_at = pg_catalog.clock_timestamp(), finished_at = pg_catalog.clock_timestamp();
        UPDATE app.recurring_templates SET next_run_date = next_date,
          last_success_at = pg_catalog.clock_timestamp(), last_success_date = due_date,
          failed_date = NULL, last_error_code = NULL, updated_at = pg_catalog.clock_timestamp()
        WHERE template_id = template_row.template_id;
        INSERT INTO app.recurring_template_events (template_id, event_type, effective_date)
        VALUES (template_row.template_id, 'BILLING_SUCCESS', due_date);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
      safe_error_code := CASE
        WHEN error_message ~ '^[a-z][a-z0-9_]{1,80}$' THEN error_message
        ELSE 'billing_occurrence_failed'
      END;
      INSERT INTO app.recurring_billing_runs (
        template_id, billing_cycle_date, status, expense_id, error_code, finished_at
      ) VALUES (
        template_row.template_id, due_date, 'FAILED', NULL, safe_error_code, pg_catalog.clock_timestamp()
      )
      ON CONFLICT (template_id, billing_cycle_date) DO UPDATE
        SET status = 'FAILED', expense_id = NULL, error_code = EXCLUDED.error_code,
            started_at = pg_catalog.clock_timestamp(), finished_at = pg_catalog.clock_timestamp();
      UPDATE app.recurring_templates SET failed_date = due_date,
        last_error_code = safe_error_code, updated_at = pg_catalog.clock_timestamp()
      WHERE template_id = template_row.template_id;
      INSERT INTO app.recurring_template_events (
        template_id, event_type, effective_date, error_code
      ) VALUES (template_row.template_id, 'BILLING_FAILED', due_date, safe_error_code);
      blocked_templates := pg_catalog.array_append(blocked_templates, template_row.template_id);
    END;
  END LOOP;
  RETURN processed;
END;
$function$;
ALTER FUNCTION private.process_due_recurring_bills(integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.process_due_recurring_bills(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.process_due_recurring_bills(integer) TO postgres;

CREATE FUNCTION api.create_recurring_template(
  p_group_id uuid, p_title text, p_total_amount numeric, p_split_mode text,
  p_frequency text, p_start_date date, p_paid_by uuid, p_participants uuid[],
  p_exact_shares jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $function$
DECLARE new_template_id uuid;
BEGIN
  new_template_id := private.create_recurring_template_for_request(
    p_group_id, p_title, p_total_amount, p_split_mode, p_frequency,
    p_start_date, p_paid_by, p_participants, p_exact_shares
  );
  RETURN pg_catalog.jsonb_build_object('template_id', new_template_id);
END;
$function$;

CREATE FUNCTION api.update_recurring_template(
  p_template_id uuid, p_title text, p_total_amount numeric, p_split_mode text,
  p_frequency text, p_paid_by uuid, p_participants uuid[], p_exact_shares jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
AS $$ SELECT private.update_recurring_template_for_request(
  p_template_id, p_title, p_total_amount, p_split_mode, p_frequency,
  p_paid_by, p_participants, p_exact_shares
) $$;

CREATE FUNCTION api.pause_recurring_template(p_template_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
AS $$ SELECT private.set_recurring_template_paused(p_template_id, true) $$;
CREATE FUNCTION api.resume_recurring_template(p_template_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
AS $$ SELECT private.set_recurring_template_paused(p_template_id, false) $$;

CREATE FUNCTION api.list_recurring_templates(
  p_group_id uuid, p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(page.item ORDER BY page.template_id), '[]'::jsonb)
  FROM (
    SELECT t.template_id, pg_catalog.jsonb_build_object(
      'template_id', t.template_id,
      'group_id', t.group_id,
      'created_by', t.created_by,
      'paid_by', t.paid_by,
      'title', v.title,
      'total_amount', v.total_amount::text,
      'split_mode', v.split_mode,
      'frequency', v.frequency,
      'next_run_date', t.next_run_date::text,
      'is_active', t.is_active,
      'last_success_at', t.last_success_at::text,
      'last_success_date', t.last_success_date::text,
      'backlog_count', private.recurring_backlog_count(t.template_id),
      'failed_date', t.failed_date::text,
      'last_error_code', t.last_error_code
    ) AS item
    FROM app.recurring_templates AS t
    JOIN app.recurring_template_versions AS v
      ON v.template_id = t.template_id AND v.version_no = t.current_version_no
    WHERE t.group_id = p_group_id AND private.is_active_member(t.group_id, auth.uid())
      AND (p_after_id IS NULL OR t.template_id > p_after_id)
    ORDER BY t.template_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) AS page
$$;

CREATE FUNCTION api.get_recurring_template(p_template_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'template_id', t.template_id,
    'group_id', t.group_id,
    'created_by', t.created_by,
    'paid_by', t.paid_by,
    'title', v.title,
    'total_amount', v.total_amount::text,
    'split_mode', v.split_mode,
    'frequency', v.frequency,
    'anchor_date', v.anchor_date::text,
    'next_run_date', t.next_run_date::text,
    'is_active', t.is_active,
    'last_success_at', t.last_success_at::text,
    'last_success_date', t.last_success_date::text,
    'backlog_count', private.recurring_backlog_count(t.template_id),
    'failed_date', t.failed_date::text,
    'last_error_code', t.last_error_code,
    'participants', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', p.user_id, 'fixed_share', p.fixed_share::text
      ) ORDER BY p.user_id)
      FROM app.recurring_template_version_participants AS p
      WHERE p.template_id = t.template_id AND p.version_no = t.current_version_no
    ), '[]'::jsonb)
  )
  FROM app.recurring_templates AS t
  JOIN app.recurring_template_versions AS v
    ON v.template_id = t.template_id AND v.version_no = t.current_version_no
  WHERE t.template_id = p_template_id AND private.is_active_member(t.group_id, auth.uid())
$$;

CREATE FUNCTION api.list_recurring_billing_runs(
  p_template_id uuid, p_after_run_id bigint DEFAULT NULL, p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(page.item ORDER BY page.run_id), '[]'::jsonb)
  FROM (
    SELECT r.run_id, pg_catalog.jsonb_build_object(
      'run_id', r.run_id,
      'billing_cycle_date', r.billing_cycle_date::text,
      'status', r.status,
      'expense_id', r.expense_id,
      'error_code', r.error_code,
      'started_at', r.started_at::text,
      'finished_at', r.finished_at::text
    ) AS item
    FROM app.recurring_billing_runs AS r
    JOIN app.recurring_templates AS t ON t.template_id = r.template_id
    WHERE r.template_id = p_template_id
      AND private.is_active_member(t.group_id, auth.uid())
      AND (p_after_run_id IS NULL OR r.run_id > p_after_run_id)
    ORDER BY r.run_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) AS page
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO authenticated;

-- Install pg_cron support, but leave scheduling disabled until Person 3's
-- production hooks and hosted smoke tests have passed.
DO $cron_setup$
BEGIN
  IF pg_catalog.to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog';
  END IF;
  IF pg_catalog.to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'pg_cron_required_for_recurring_bills';
  END IF;
  GRANT USAGE ON SCHEMA cron TO postgres;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
END;
$cron_setup$;
