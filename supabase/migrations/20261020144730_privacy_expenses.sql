-- Private income bands and immutable expense ledger. All exposed API functions
-- are INVOKER wrappers; privileged writes are narrowly scoped in private.

GRANT USAGE ON SCHEMA extensions TO nobroke_executor;

CREATE TABLE app.user_private_financials (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE RESTRICT,
  band_weight numeric(4,2) NOT NULL CHECK (band_weight IN (1.00, 1.35, 1.75, 2.25)),
  configured_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE app.user_private_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_private_financials FORCE ROW LEVEL SECURITY;
CREATE POLICY private_financials_executor ON app.user_private_financials TO nobroke_executor
  USING (true) WITH CHECK (true);
REVOKE ALL ON app.user_private_financials FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.user_private_financials TO nobroke_executor;

CREATE FUNCTION private.set_private_income(p_monthly_income numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  private_band numeric(4,2);
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_monthly_income IS NULL OR p_monthly_income <= 0
     OR p_monthly_income::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'invalid_monthly_income' USING ERRCODE = 'P0001';
  END IF;

  private_band := CASE
    WHEN p_monthly_income < 25000 THEN 1.00
    WHEN p_monthly_income < 50000 THEN 1.35
    WHEN p_monthly_income < 100000 THEN 1.75
    ELSE 2.25
  END;

  INSERT INTO app.user_private_financials (user_id, band_weight)
  VALUES (caller_id, private_band)
  ON CONFLICT (user_id) DO UPDATE
  SET band_weight = EXCLUDED.band_weight,
      configured_at = pg_catalog.clock_timestamp();
END;
$function$;
ALTER FUNCTION private.set_private_income(numeric) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.set_private_income(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_private_income(numeric) TO authenticated;

CREATE FUNCTION private.clear_private_income()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM app.user_private_financials WHERE user_id = caller_id;
  RETURN FOUND;
END;
$function$;
ALTER FUNCTION private.clear_private_income() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.clear_private_income() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.clear_private_income() TO authenticated;

CREATE FUNCTION private.private_income_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'configured', EXISTS (
      SELECT 1 FROM app.user_private_financials WHERE user_id = auth.uid()
    )
  )
$$;
ALTER FUNCTION private.private_income_status() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.private_income_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.private_income_status() TO authenticated;

CREATE FUNCTION api.set_private_income(p_monthly_income numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $$ BEGIN
  PERFORM private.set_private_income(p_monthly_income);
  RETURN pg_catalog.jsonb_build_object('configured', true);
END $$;
CREATE FUNCTION api.clear_private_income()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
AS $$ SELECT pg_catalog.jsonb_build_object(
  'configured', false, 'cleared', private.clear_private_income()
) $$;
CREATE FUNCTION api.get_private_income_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$ SELECT private.private_income_status() $$;

CREATE TABLE app.expenses (
  expense_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES app.expense_groups (group_id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(title)) BETWEEN 1 AND 120),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount > 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  split_mode text NOT NULL CHECK (split_mode IN ('EQUAL', 'EXACT', 'INCOME_RATIO')),
  paid_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  request_hash bytea NOT NULL,
  source_type text NOT NULL DEFAULT 'MANUAL' CHECK (source_type IN ('MANUAL', 'RECURRING')),
  source_template_id uuid,
  billing_cycle_date date,
  replaces_expense_id uuid REFERENCES app.expenses (expense_id) ON DELETE RESTRICT,
  replaced_by_expense_id uuid REFERENCES app.expenses (expense_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOIDED')),
  correction_reason text,
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (
    (source_type = 'MANUAL' AND source_template_id IS NULL AND billing_cycle_date IS NULL)
    OR (source_type = 'RECURRING' AND source_template_id IS NOT NULL AND billing_cycle_date IS NOT NULL)
  ),
  CHECK ((status = 'POSTED' AND voided_at IS NULL AND voided_by IS NULL)
    OR (status = 'VOIDED' AND voided_at IS NOT NULL AND voided_by IS NOT NULL)),
  UNIQUE (created_by, request_id),
  UNIQUE (replaces_expense_id)
);
CREATE INDEX expenses_group_cursor ON app.expenses (group_id, expense_id);
CREATE UNIQUE INDEX expenses_recurring_occurrence_unique
  ON app.expenses (source_template_id, billing_cycle_date) WHERE source_type = 'RECURRING';

CREATE TABLE app.expense_splits (
  split_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES app.expenses (expense_id) ON DELETE RESTRICT,
  participant_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  share_amount numeric(12,2) NOT NULL CHECK (share_amount >= 0),
  UNIQUE (expense_id, participant_id)
);
CREATE INDEX expense_splits_participant ON app.expense_splits (participant_id, expense_id);

CREATE TABLE app.expense_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  expense_id uuid NOT NULL REFERENCES app.expenses (expense_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('POSTED', 'VOIDED', 'REPLACED')),
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE RESTRICT,
  reason text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX expense_audit_expense_created ON app.expense_audit (expense_id, created_at, audit_id);

CREATE FUNCTION private.expense_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'expense_history_is_immutable' USING ERRCODE = 'P0001';
  END IF;
  IF (OLD.expense_id, OLD.group_id, OLD.title, OLD.total_amount, OLD.currency,
      OLD.split_mode, OLD.paid_by, OLD.created_by, OLD.request_id, OLD.request_hash,
      OLD.source_type, OLD.source_template_id, OLD.billing_cycle_date,
      OLD.replaces_expense_id, OLD.created_at)
     IS DISTINCT FROM
     (NEW.expense_id, NEW.group_id, NEW.title, NEW.total_amount, NEW.currency,
      NEW.split_mode, NEW.paid_by, NEW.created_by, NEW.request_id, NEW.request_hash,
      NEW.source_type, NEW.source_template_id, NEW.billing_cycle_date,
      NEW.replaces_expense_id, NEW.created_at) THEN
    RAISE EXCEPTION 'expense_history_is_immutable' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'POSTED' THEN
    IF NEW.status = 'POSTED' THEN
      IF (NEW.correction_reason, NEW.voided_at, NEW.voided_by, NEW.replaced_by_expense_id)
         IS DISTINCT FROM
         (OLD.correction_reason, OLD.voided_at, OLD.voided_by, OLD.replaced_by_expense_id) THEN
        RAISE EXCEPTION 'expense_history_is_immutable' USING ERRCODE = 'P0001';
      END IF;
    ELSIF NEW.status = 'VOIDED' THEN
      IF NEW.correction_reason IS NULL OR NEW.voided_at IS NULL OR NEW.voided_by IS NULL
         OR NEW.replaced_by_expense_id IS DISTINCT FROM OLD.replaced_by_expense_id THEN
        RAISE EXCEPTION 'invalid_expense_correction' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      RAISE EXCEPTION 'expense_history_is_immutable' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF NEW.status <> OLD.status
       OR (NEW.correction_reason, NEW.voided_at, NEW.voided_by)
          IS DISTINCT FROM (OLD.correction_reason, OLD.voided_at, OLD.voided_by)
       OR (OLD.replaced_by_expense_id IS NOT NULL
          AND NEW.replaced_by_expense_id IS DISTINCT FROM OLD.replaced_by_expense_id) THEN
      RAISE EXCEPTION 'expense_history_is_immutable' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.replaced_by_expense_id IS NULL AND NEW.replaced_by_expense_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM app.expenses AS replacement
         WHERE replacement.expense_id = NEW.replaced_by_expense_id
           AND replacement.replaces_expense_id = OLD.expense_id
       ) THEN
      RAISE EXCEPTION 'invalid_expense_replacement_link' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.expense_immutability_guard() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.expense_immutability_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER expenses_immutable
  BEFORE UPDATE OR DELETE ON app.expenses
  FOR EACH ROW EXECUTE FUNCTION private.expense_immutability_guard();

ALTER TABLE app.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.expense_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_executor ON app.expenses TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY expense_splits_executor ON app.expense_splits TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY expense_audit_executor ON app.expense_audit TO nobroke_executor
  USING (true) WITH CHECK (true);
CREATE POLICY expenses_group_members_read ON app.expenses FOR SELECT TO authenticated
  USING (private.is_active_member(group_id, auth.uid()));
CREATE POLICY expense_splits_group_members_read ON app.expense_splits FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.expenses AS e
    WHERE e.expense_id = expense_splits.expense_id
      AND private.is_active_member(e.group_id, auth.uid())
  ));
CREATE POLICY expense_audit_group_members_read ON app.expense_audit FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.expenses AS e
    WHERE e.expense_id = expense_audit.expense_id
      AND private.is_active_member(e.group_id, auth.uid())
  ));
GRANT SELECT ON app.expenses, app.expense_splits, app.expense_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.expenses TO nobroke_executor;
GRANT SELECT, INSERT ON app.expense_splits, app.expense_audit TO nobroke_executor;

CREATE FUNCTION private.calculate_expense_shares(
  p_group_id uuid,
  p_total_amount numeric,
  p_split_mode text,
  p_participants uuid[],
  p_exact_shares jsonb DEFAULT NULL
)
RETURNS TABLE (participant_id uuid, share_amount numeric(12,2))
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app
AS $function$
DECLARE
  participant_count integer;
  distinct_count integer;
  active_count integer;
  configured_count integer;
  exact_count integer;
  exact_total numeric;
BEGIN
  IF p_total_amount IS NULL OR p_total_amount <= 0
     OR p_total_amount > 9999999999.99
     OR p_total_amount <> pg_catalog.round(p_total_amount, 2) THEN
    RAISE EXCEPTION 'invalid_expense_amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_split_mode IS NULL OR p_split_mode NOT IN ('EQUAL', 'EXACT', 'INCOME_RATIO') THEN
    RAISE EXCEPTION 'invalid_split_mode' USING ERRCODE = 'P0001';
  END IF;
  IF p_participants IS NULL OR pg_catalog.cardinality(p_participants) = 0 THEN
    RAISE EXCEPTION 'invalid_participants' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*), count(DISTINCT supplied.participant_id)
  INTO participant_count, distinct_count
  FROM pg_catalog.unnest(p_participants) AS supplied(participant_id);
  IF participant_count <> distinct_count OR EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_participants) AS supplied(participant_id)
    WHERE supplied.participant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid_participants' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO active_count
  FROM app.group_memberships AS gm
  WHERE gm.group_id = p_group_id AND gm.user_id = ANY (p_participants)
    AND gm.removed_at IS NULL;
  IF active_count <> participant_count THEN
    RAISE EXCEPTION 'participants_must_be_active_group_members' USING ERRCODE = 'P0001';
  END IF;

  IF p_split_mode = 'INCOME_RATIO' THEN
    IF participant_count < 3 THEN
      RAISE EXCEPTION 'income_split_requires_three_participants' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO configured_count
    FROM app.user_private_financials AS f
    WHERE f.user_id = ANY (p_participants);
    IF configured_count <> participant_count THEN
      RAISE EXCEPTION 'income_setup_required' USING ERRCODE = 'P0001';
    END IF;
    IF p_exact_shares IS NOT NULL THEN
      RAISE EXCEPTION 'unexpected_exact_shares' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_split_mode = 'EQUAL' THEN
    IF p_exact_shares IS NOT NULL THEN
      RAISE EXCEPTION 'unexpected_exact_shares' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF pg_catalog.jsonb_typeof(p_exact_shares) <> 'object' THEN
      RAISE EXCEPTION 'invalid_exact_shares' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_each(p_exact_shares) AS share(key, value)
      WHERE share.key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        OR pg_catalog.jsonb_typeof(share.value) NOT IN ('string', 'number')
        OR (share.value #>> '{}') !~ '^[0-9]+([.][0-9]{1,2})?$'
    ) THEN
      RAISE EXCEPTION 'invalid_exact_shares' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*), pg_catalog.sum((share.value #>> '{}')::numeric)
    INTO exact_count, exact_total
    FROM pg_catalog.jsonb_each(p_exact_shares) AS share(key, value);
    IF exact_count <> participant_count OR exact_total <> p_total_amount OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_each(p_exact_shares) AS share(key, value)
      WHERE NOT (share.key::uuid = ANY (p_participants))
    ) THEN
      RAISE EXCEPTION 'invalid_exact_shares' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY
      SELECT share.key::uuid, (share.value #>> '{}')::numeric(12,2)
      FROM pg_catalog.jsonb_each(p_exact_shares) AS share(key, value)
      ORDER BY share.key::uuid;
    RETURN;
  END IF;

  RETURN QUERY
    WITH weights AS (
      SELECT supplied.participant_id,
        CASE WHEN p_split_mode = 'INCOME_RATIO' THEN f.band_weight ELSE 1.00::numeric END AS weight
      FROM pg_catalog.unnest(p_participants) AS supplied(participant_id)
      LEFT JOIN app.user_private_financials AS f ON f.user_id = supplied.participant_id
    ), raw_shares AS (
      SELECT w.participant_id,
        pg_catalog.floor((p_total_amount * 100 * w.weight)
          / pg_catalog.sum(w.weight) OVER ())::bigint AS base_minor,
        pg_catalog.mod((p_total_amount * 100 * w.weight),
          pg_catalog.sum(w.weight) OVER ()) AS remainder
      FROM weights AS w
    ), ranked AS (
      SELECT r.*,
        pg_catalog.row_number() OVER (ORDER BY r.remainder DESC, r.participant_id ASC) AS rank,
        ((p_total_amount * 100)::bigint
          - (SELECT pg_catalog.sum(base_minor) FROM raw_shares)) AS remaining_minor
      FROM raw_shares AS r
    )
    SELECT r.participant_id,
      ((r.base_minor + CASE WHEN r.rank <= r.remaining_minor THEN 1 ELSE 0 END)::numeric
        / 100)::numeric(12,2)
    FROM ranked AS r;
END;
$function$;
ALTER FUNCTION private.calculate_expense_shares(uuid, numeric, text, uuid[], jsonb) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.calculate_expense_shares(uuid, numeric, text, uuid[], jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.validate_expense_amount(p_total_amount numeric)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_total_amount IS NULL OR p_total_amount <= 0
     OR pg_catalog.scale(p_total_amount) > 2
     OR p_total_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'invalid_expense_amount' USING ERRCODE = 'P0001';
  END IF;
  RETURN p_total_amount;
END;
$function$;
ALTER FUNCTION private.validate_expense_amount(numeric) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.validate_expense_amount(numeric) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.expense_request_hash(
  p_group_id uuid,
  p_title text,
  p_total_amount numeric,
  p_split_mode text,
  p_paid_by uuid,
  p_participants uuid[],
  p_exact_shares jsonb,
  p_replaces_expense_id uuid,
  p_idempotency_context text DEFAULT NULL
)
RETURNS bytea
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
  SELECT extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'group_id', p_group_id::text,
      'title', pg_catalog.btrim(p_title),
      'total_amount', private.validate_expense_amount(p_total_amount)::numeric(12,2)::text,
      'split_mode', pg_catalog.upper(p_split_mode),
      'paid_by', p_paid_by::text,
      'participants', COALESCE((
        SELECT pg_catalog.jsonb_agg(supplied.participant_id::text ORDER BY supplied.participant_id)
        FROM pg_catalog.unnest(p_participants) AS supplied(participant_id)
      ), '[]'::jsonb),
      'exact_shares', p_exact_shares,
      'replaces_expense_id', p_replaces_expense_id::text,
      'context', p_idempotency_context
    )::text, 'UTF8'), 'sha256'
  )
$$;
ALTER FUNCTION private.expense_request_hash(uuid, text, numeric, text, uuid, uuid[], jsonb, uuid, text)
  OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.expense_request_hash(uuid, text, numeric, text, uuid, uuid[], jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.create_expense_core(
  p_group_id uuid,
  p_title text,
  p_total_amount numeric,
  p_split_mode text,
  p_paid_by uuid,
  p_participants uuid[],
  p_exact_shares jsonb,
  p_created_by uuid,
  p_request_id uuid,
  p_source_type text DEFAULT 'MANUAL',
  p_source_template_id uuid DEFAULT NULL,
  p_billing_cycle_date date DEFAULT NULL,
  p_replaces_expense_id uuid DEFAULT NULL,
  p_idempotency_context text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private, extensions
AS $function$
DECLARE
  payload_hash bytea;
  existing_expense_id uuid;
  existing_hash bytea;
  new_expense_id uuid;
  membership_count integer;
  payer_is_member boolean;
BEGIN
  IF p_created_by IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_title IS NULL OR pg_catalog.length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_expense_title' USING ERRCODE = 'P0001';
  END IF;
  IF p_source_type NOT IN ('MANUAL', 'RECURRING')
     OR (p_source_type = 'MANUAL' AND (p_source_template_id IS NOT NULL OR p_billing_cycle_date IS NOT NULL))
     OR (p_source_type = 'RECURRING' AND (p_source_template_id IS NULL OR p_billing_cycle_date IS NULL)) THEN
    RAISE EXCEPTION 'invalid_expense_source' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM app.expense_groups WHERE group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group_access_denied' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO membership_count FROM app.group_memberships
  WHERE group_id = p_group_id AND user_id = p_created_by AND removed_at IS NULL;
  SELECT EXISTS (
    SELECT 1 FROM app.group_memberships
    WHERE group_id = p_group_id AND user_id = p_paid_by AND removed_at IS NULL
  ) INTO payer_is_member;
  IF (p_source_type = 'MANUAL' AND membership_count <> 1) OR NOT payer_is_member THEN
    RAISE EXCEPTION 'group_access_denied' USING ERRCODE = 'P0001';
  END IF;

  payload_hash := private.expense_request_hash(
    p_group_id, p_title, p_total_amount, p_split_mode, p_paid_by,
    p_participants, p_exact_shares, p_replaces_expense_id, p_idempotency_context
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_created_by::text || ':' || p_request_id::text, 0)
  );
  SELECT expense_id, request_hash INTO existing_expense_id, existing_hash
  FROM app.expenses WHERE created_by = p_created_by AND request_id = p_request_id;
  IF FOUND THEN
    IF existing_hash <> payload_hash THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
    END IF;
    RETURN existing_expense_id;
  END IF;

  INSERT INTO app.expenses (
    group_id, title, total_amount, split_mode, paid_by, created_by,
    request_id, request_hash, source_type, source_template_id,
    billing_cycle_date, replaces_expense_id
  ) VALUES (
    p_group_id, pg_catalog.btrim(p_title), p_total_amount::numeric(12,2),
    pg_catalog.upper(p_split_mode), p_paid_by, p_created_by,
    p_request_id, payload_hash, p_source_type, p_source_template_id,
    p_billing_cycle_date, p_replaces_expense_id
  ) RETURNING expense_id INTO new_expense_id;

  INSERT INTO app.expense_splits (expense_id, participant_id, share_amount)
  SELECT new_expense_id, shares.participant_id, shares.share_amount
  FROM private.calculate_expense_shares(
    p_group_id, p_total_amount, pg_catalog.upper(p_split_mode), p_participants, p_exact_shares
  ) AS shares;
  IF (SELECT COALESCE(pg_catalog.sum(s.share_amount), 0)
      FROM app.expense_splits AS s WHERE s.expense_id = new_expense_id)
     <> p_total_amount::numeric(12,2) THEN
    RAISE EXCEPTION 'split_conservation_failed' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO app.expense_audit (expense_id, event_type, actor_user_id)
  VALUES (new_expense_id, 'POSTED',
    CASE WHEN p_source_type = 'MANUAL' THEN p_created_by ELSE p_actor_user_id END);

  PERFORM private.require_person3_hook('private.post_expense_obligations(uuid)');
  EXECUTE 'SELECT private.post_expense_obligations($1)' USING new_expense_id;
  RETURN new_expense_id;
END;
$function$;
ALTER FUNCTION private.create_expense_core(uuid, text, numeric, text, uuid, uuid[], jsonb, uuid, uuid, text, uuid, date, uuid, text, uuid)
  OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.create_expense_core(uuid, text, numeric, text, uuid, uuid[], jsonb, uuid, uuid, text, uuid, date, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.create_expense_for_request(
  p_group_id uuid,
  p_title text,
  p_total_amount numeric,
  p_split_mode text,
  p_paid_by uuid,
  p_participants uuid[],
  p_exact_shares jsonb,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  RETURN private.create_expense_core(
    p_group_id, p_title, p_total_amount, p_split_mode, p_paid_by,
    p_participants, p_exact_shares, caller_id, p_request_id
  );
END;
$function$;
ALTER FUNCTION private.create_expense_for_request(uuid, text, numeric, text, uuid, uuid[], jsonb, uuid)
  OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.create_expense_for_request(uuid, text, numeric, text, uuid, uuid[], jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_expense_for_request(uuid, text, numeric, text, uuid, uuid[], jsonb, uuid)
  TO authenticated;

CREATE FUNCTION private.void_expense_core(p_expense_id uuid, p_actor uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  expense_row app.expenses%ROWTYPE;
  expense_group_id uuid;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'correction_reason_required' USING ERRCODE = 'P0001';
  END IF;
  SELECT e.group_id INTO expense_group_id FROM app.expenses AS e WHERE e.expense_id = p_expense_id;
  IF expense_group_id IS NULL THEN RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM app.expense_groups AS g WHERE g.group_id = expense_group_id FOR UPDATE;
  SELECT * INTO expense_row FROM app.expenses WHERE expense_id = p_expense_id FOR UPDATE;
  IF NOT FOUND OR NOT private.is_active_member(expense_row.group_id, p_actor) THEN
    RAISE EXCEPTION 'group_access_denied' USING ERRCODE = 'P0001';
  END IF;
  IF expense_row.status <> 'POSTED' THEN
    RAISE EXCEPTION 'expense_already_voided' USING ERRCODE = 'P0001';
  END IF;
  IF expense_row.created_by <> p_actor AND NOT private.is_group_owner(expense_row.group_id, p_actor) THEN
    RAISE EXCEPTION 'expense_correction_forbidden' USING ERRCODE = 'P0001';
  END IF;

  PERFORM private.require_person3_hook('private.void_expense_obligations(uuid)');
  EXECUTE 'SELECT private.void_expense_obligations($1)' USING p_expense_id;
  UPDATE app.expenses SET status = 'VOIDED', correction_reason = pg_catalog.btrim(p_reason),
    voided_at = pg_catalog.clock_timestamp(), voided_by = p_actor
  WHERE expense_id = p_expense_id;
  INSERT INTO app.expense_audit (expense_id, event_type, actor_user_id, reason)
  VALUES (p_expense_id, 'VOIDED', p_actor, pg_catalog.btrim(p_reason));
END;
$function$;
ALTER FUNCTION private.void_expense_core(uuid, uuid, text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.void_expense_core(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.void_expense_for_request(p_expense_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  PERFORM private.void_expense_core(p_expense_id, caller_id, p_reason);
END;
$function$;
ALTER FUNCTION private.void_expense_for_request(uuid, text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.void_expense_for_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.void_expense_for_request(uuid, text) TO authenticated;

CREATE FUNCTION private.replace_expense_for_request(
  p_expense_id uuid,
  p_reason text,
  p_group_id uuid,
  p_title text,
  p_total_amount numeric,
  p_split_mode text,
  p_paid_by uuid,
  p_participants uuid[],
  p_exact_shares jsonb,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  old_expense app.expenses%ROWTYPE;
  old_group_id uuid;
  payload_hash bytea;
  existing_expense_id uuid;
  existing_hash bytea;
  replacement_id uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  SELECT e.group_id INTO old_group_id FROM app.expenses AS e WHERE e.expense_id = p_expense_id;
  IF old_group_id IS NULL OR old_group_id <> p_group_id THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM app.expense_groups AS g WHERE g.group_id = old_group_id FOR UPDATE;
  SELECT * INTO old_expense FROM app.expenses WHERE expense_id = p_expense_id FOR UPDATE;
  payload_hash := private.expense_request_hash(
    p_group_id, p_title, p_total_amount, p_split_mode, p_paid_by,
    p_participants, p_exact_shares, p_expense_id, pg_catalog.btrim(p_reason)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text || ':' || p_request_id::text, 0)
  );
  SELECT expense_id, request_hash INTO existing_expense_id, existing_hash
  FROM app.expenses WHERE created_by = caller_id AND request_id = p_request_id;
  IF FOUND THEN
    IF existing_hash <> payload_hash OR existing_expense_id IS NULL THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
    END IF;
    RETURN existing_expense_id;
  END IF;

  PERFORM private.void_expense_core(p_expense_id, caller_id, p_reason);
  replacement_id := private.create_expense_core(
    p_group_id, p_title, p_total_amount, p_split_mode, p_paid_by,
    p_participants, p_exact_shares, caller_id, p_request_id,
    'MANUAL', NULL, NULL, p_expense_id, pg_catalog.btrim(p_reason)
  );
  UPDATE app.expenses SET replaced_by_expense_id = replacement_id
  WHERE expense_id = p_expense_id;
  INSERT INTO app.expense_audit (expense_id, event_type, actor_user_id, reason)
  VALUES (p_expense_id, 'REPLACED', caller_id, pg_catalog.btrim(p_reason));
  RETURN replacement_id;
END;
$function$;
ALTER FUNCTION private.replace_expense_for_request(uuid, text, uuid, text, numeric, text, uuid, uuid[], jsonb, uuid)
  OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.replace_expense_for_request(uuid, text, uuid, text, numeric, text, uuid, uuid[], jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.replace_expense_for_request(uuid, text, uuid, text, numeric, text, uuid, uuid[], jsonb, uuid)
  TO authenticated;

CREATE FUNCTION api.create_expense(
  p_group_id uuid, p_title text, p_total_amount numeric, p_split_mode text,
  p_paid_by uuid, p_participants uuid[], p_request_id uuid, p_exact_shares jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $function$
DECLARE new_expense_id uuid;
BEGIN
  new_expense_id := private.create_expense_for_request(
    p_group_id, p_title, p_total_amount, p_split_mode, p_paid_by,
    p_participants, p_exact_shares, p_request_id
  );
  RETURN pg_catalog.jsonb_build_object('expense_id', new_expense_id);
END;
$function$;

CREATE FUNCTION api.void_expense(p_expense_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $$ BEGIN
  PERFORM private.void_expense_for_request(p_expense_id, p_reason);
  RETURN pg_catalog.jsonb_build_object('expense_id', p_expense_id, 'status', 'VOIDED');
END $$;

CREATE FUNCTION api.replace_expense(
  p_expense_id uuid, p_reason text, p_group_id uuid, p_title text,
  p_total_amount numeric, p_split_mode text, p_paid_by uuid,
  p_participants uuid[], p_request_id uuid, p_exact_shares jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $function$
DECLARE new_expense_id uuid;
BEGIN
  new_expense_id := private.replace_expense_for_request(
    p_expense_id, p_reason, p_group_id, p_title, p_total_amount,
    p_split_mode, p_paid_by, p_participants, p_exact_shares, p_request_id
  );
  RETURN pg_catalog.jsonb_build_object('expense_id', new_expense_id, 'replaces_expense_id', p_expense_id);
END;
$function$;

CREATE FUNCTION api.get_expense(p_expense_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'expense_id', e.expense_id,
    'group_id', e.group_id,
    'title', e.title,
    'total_amount', e.total_amount::text,
    'currency', e.currency,
    'split_mode', e.split_mode,
    'paid_by', e.paid_by,
    'created_by', e.created_by,
    'status', e.status,
    'replaces_expense_id', e.replaces_expense_id,
    'replaced_by_expense_id', e.replaced_by_expense_id,
    'correction_reason', e.correction_reason,
    'created_at', e.created_at::text,
    'splits', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'participant_id', s.participant_id, 'share_amount', s.share_amount::text
      ) ORDER BY s.participant_id)
      FROM app.expense_splits AS s WHERE s.expense_id = e.expense_id
    ), '[]'::jsonb)
  )
  FROM app.expenses AS e
  WHERE e.expense_id = p_expense_id AND private.is_active_member(e.group_id, auth.uid())
$$;

CREATE FUNCTION api.list_expenses(p_group_id uuid, p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(page.item ORDER BY page.expense_id), '[]'::jsonb)
  FROM (
    SELECT e.expense_id, pg_catalog.jsonb_build_object(
      'expense_id', e.expense_id,
      'group_id', e.group_id,
      'title', e.title,
      'total_amount', e.total_amount::text,
      'currency', e.currency,
      'split_mode', e.split_mode,
      'paid_by', e.paid_by,
      'created_by', e.created_by,
      'status', e.status,
      'replaces_expense_id', e.replaces_expense_id,
      'replaced_by_expense_id', e.replaced_by_expense_id,
      'correction_reason', e.correction_reason,
      'created_at', e.created_at::text,
      'splits', COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'participant_id', s.participant_id, 'share_amount', s.share_amount::text
        ) ORDER BY s.participant_id)
        FROM app.expense_splits AS s WHERE s.expense_id = e.expense_id
      ), '[]'::jsonb)
    ) AS item
    FROM app.expenses AS e
    WHERE e.group_id = p_group_id
      AND (p_after_id IS NULL OR e.expense_id > p_after_id)
      AND private.is_active_member(e.group_id, auth.uid())
    ORDER BY e.expense_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) AS page
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO authenticated;
