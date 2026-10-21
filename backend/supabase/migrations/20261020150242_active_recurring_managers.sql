-- A departed creator is no longer an authorized manager for their group's bill.
CREATE OR REPLACE FUNCTION private.can_manage_recurring(p_template_id uuid, p_user_id uuid)
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

-- Validate money before hashing or idempotency lookup so rounded hashes cannot
-- make an invalid precision retry appear identical to a valid posted expense.
CREATE OR REPLACE FUNCTION private.validate_expense_amount(p_total_amount numeric)
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

CREATE OR REPLACE FUNCTION private.expense_request_hash(
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

-- The initial migration used to start this job immediately. Keep it stopped
-- until the real Person 3 hooks and hosted smoke tests pass.
DO $disable_scheduler$
DECLARE scheduled_job_id bigint;
BEGIN
  FOR scheduled_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'nobroke-recurring-bills'
  LOOP
    PERFORM cron.unschedule(scheduled_job_id);
  END LOOP;
END;
$disable_scheduler$;
