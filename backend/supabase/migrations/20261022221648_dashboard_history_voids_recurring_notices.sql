-- Server-owned dashboard aggregates, paged membership history, idempotent voids,
-- and recurring-bill notifications. No scheduler is installed in this migration.

CREATE TABLE app.expense_void_requests (
  actor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  expense_id uuid NOT NULL REFERENCES app.expenses (expense_id) ON DELETE RESTRICT,
  payload_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (actor_user_id, request_id)
);
ALTER TABLE app.expense_void_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY expense_void_requests_executor ON app.expense_void_requests
  TO nobroke_executor USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.expense_void_requests TO nobroke_executor;

CREATE FUNCTION private.void_expense_idempotent(p_expense_id uuid, p_reason text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private, extensions
AS $function$
DECLARE caller_id uuid := auth.uid(); old_request app.expense_void_requests%ROWTYPE; payload bytea;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001'; END IF;
  IF p_request_id IS NULL OR p_expense_id IS NULL OR p_reason IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'correction_reason_required' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.lock_financial_writes();
  payload := extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'expense_id', p_expense_id::text, 'reason', pg_catalog.btrim(p_reason)
  )::text, 'UTF8'), 'sha256');
  SELECT * INTO old_request FROM app.expense_void_requests
  WHERE actor_user_id = caller_id AND request_id = p_request_id;
  IF FOUND THEN
    IF old_request.expense_id <> p_expense_id OR old_request.payload_hash <> payload THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
    END IF;
    RETURN pg_catalog.jsonb_build_object('expense_id', p_expense_id, 'status', 'VOIDED');
  END IF;
  PERFORM private.void_expense_for_request(p_expense_id, p_reason);
  INSERT INTO app.expense_void_requests(actor_user_id, request_id, expense_id, payload_hash)
  VALUES (caller_id, p_request_id, p_expense_id, payload);
  RETURN pg_catalog.jsonb_build_object('expense_id', p_expense_id, 'status', 'VOIDED');
END
$function$;
ALTER FUNCTION private.void_expense_idempotent(uuid, text, uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.void_expense_idempotent(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.void_expense_idempotent(uuid, text, uuid) TO authenticated;

CREATE FUNCTION api.void_expense_request(p_expense_id uuid, p_reason text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  RETURN private.void_expense_idempotent(p_expense_id, p_reason, p_request_id);
END
$function$;
REVOKE ALL ON FUNCTION api.void_expense_request(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.void_expense_request(uuid, text, uuid) TO authenticated;

CREATE FUNCTION private.get_dashboard_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
  WITH groups AS (
    SELECT gm.group_id FROM app.group_memberships gm
    WHERE gm.user_id = auth.uid() AND gm.removed_at IS NULL
  ), open_debts AS (
    SELECT o.* FROM app.obligations o
    WHERE auth.uid() IN (o.debtor_user_id, o.creditor_user_id) AND o.status IN ('OPEN', 'PARTIAL')
  ), month_expenses AS (
    SELECT e.expense_id, e.paid_by, e.total_amount FROM app.expenses e
    JOIN groups g USING (group_id)
    WHERE e.status = 'POSTED'
      AND pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', e.created_at))
        = pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', pg_catalog.now()))
  ), month_settlements AS (
    SELECT s.amount FROM app.settlement_records s
    WHERE s.settlement_type = 'EXTERNAL_PAYMENT'
      AND auth.uid() IN (s.from_user_id, s.to_user_id)
      AND pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', s.created_at))
        = pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', pg_catalog.now()))
  )
  SELECT pg_catalog.jsonb_build_object(
    'group_count', (SELECT pg_catalog.count(*)::integer FROM groups),
    'owe_total', COALESCE((SELECT pg_catalog.sum(remaining_amount) FROM open_debts WHERE debtor_user_id = auth.uid()), 0)::numeric(12,2)::text,
    'owed_total', COALESCE((SELECT pg_catalog.sum(remaining_amount) FROM open_debts WHERE creditor_user_id = auth.uid()), 0)::numeric(12,2)::text,
    'net_balance', (COALESCE((SELECT pg_catalog.sum(remaining_amount) FROM open_debts WHERE creditor_user_id = auth.uid()), 0)
      - COALESCE((SELECT pg_catalog.sum(remaining_amount) FROM open_debts WHERE debtor_user_id = auth.uid()), 0))::numeric(12,2)::text,
    'open_payable_count', (SELECT pg_catalog.count(*)::integer FROM open_debts WHERE debtor_user_id = auth.uid()),
    'open_receivable_count', (SELECT pg_catalog.count(*)::integer FROM open_debts WHERE creditor_user_id = auth.uid()),
    'current_month_spend', COALESCE((SELECT pg_catalog.sum(s.share_amount) FROM month_expenses e
      JOIN app.expense_splits s USING (expense_id) WHERE s.participant_id = auth.uid()), 0)::numeric(12,2)::text,
    'current_month_paid', COALESCE((SELECT pg_catalog.sum(total_amount) FROM month_expenses WHERE paid_by = auth.uid()), 0)::numeric(12,2)::text,
    'current_month_group_total', COALESCE((SELECT pg_catalog.sum(total_amount) FROM month_expenses), 0)::numeric(12,2)::text,
    'current_month_settled', COALESCE((SELECT pg_catalog.sum(amount) FROM month_settlements), 0)::numeric(12,2)::text,
    'current_month_settlement_count', (SELECT pg_catalog.count(*)::integer FROM month_settlements),
    'current_month_clear_percent', CASE
      WHEN COALESCE((SELECT pg_catalog.sum(amount) FROM month_settlements), 0)
        + COALESCE((SELECT pg_catalog.sum(remaining_amount) FROM open_debts WHERE debtor_user_id = auth.uid()), 0) = 0 THEN 100
      ELSE pg_catalog.round(100 * COALESCE((SELECT pg_catalog.sum(amount) FROM month_settlements), 0)
        / (COALESCE((SELECT pg_catalog.sum(amount) FROM month_settlements), 0)
          + COALESCE((SELECT pg_catalog.sum(remaining_amount) FROM open_debts WHERE debtor_user_id = auth.uid()), 0)))::integer
    END
  )
$$;
ALTER FUNCTION private.get_dashboard_summary() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.get_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_dashboard_summary() TO authenticated;

CREATE OR REPLACE FUNCTION api.get_dashboard_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT private.get_dashboard_summary() $$;

CREATE FUNCTION private.get_dashboard_balances()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'user_id', peer.user_id, 'username', peer.username, 'display_name', peer.display_name,
    'net_amount', peer.net_amount::numeric(12,2)::text
  ) ORDER BY peer.net_amount DESC, peer.user_id), '[]'::jsonb)
  FROM (
    SELECT p.user_id, p.username, p.display_name,
      pg_catalog.sum(CASE WHEN o.creditor_user_id = auth.uid() THEN o.remaining_amount ELSE -o.remaining_amount END) AS net_amount
    FROM app.obligations o
    JOIN app.profiles p ON p.user_id = CASE WHEN o.debtor_user_id = auth.uid() THEN o.creditor_user_id ELSE o.debtor_user_id END
    WHERE auth.uid() IN (o.debtor_user_id, o.creditor_user_id) AND o.status IN ('OPEN', 'PARTIAL')
    GROUP BY p.user_id, p.username, p.display_name
  ) AS peer
$$;
ALTER FUNCTION private.get_dashboard_balances() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.get_dashboard_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_dashboard_balances() TO authenticated;
CREATE FUNCTION api.get_dashboard_balances()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT private.get_dashboard_balances() $$;

CREATE FUNCTION private.get_dashboard_group_spending()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $$
  WITH member_groups AS (
    SELECT DISTINCT gm.group_id, g.group_name FROM app.group_memberships gm
    JOIN app.expense_groups g USING (group_id)
    WHERE gm.user_id = auth.uid() AND gm.removed_at IS NULL
  ), amounts AS (
    SELECT mg.group_id, mg.group_name, COALESCE(pg_catalog.sum(e.total_amount), 0) AS amount
    FROM member_groups mg LEFT JOIN app.expenses e ON e.group_id = mg.group_id
      AND e.status = 'POSTED'
      AND pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', e.created_at))
        = pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', pg_catalog.now()))
    GROUP BY mg.group_id, mg.group_name
  ), totals AS (SELECT COALESCE(pg_catalog.sum(amount), 0) AS total FROM amounts)
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'group_id', a.group_id, 'group_name', a.group_name, 'amount', a.amount::numeric(12,2)::text,
    'total_amount', t.total::numeric(12,2)::text,
    'share_percent', CASE WHEN t.total = 0 THEN 0 ELSE pg_catalog.round(a.amount * 100 / t.total)::integer END
  ) ORDER BY a.amount DESC, a.group_id), '[]'::jsonb)
  FROM amounts a CROSS JOIN totals t
$$;
ALTER FUNCTION private.get_dashboard_group_spending() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.get_dashboard_group_spending() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_dashboard_group_spending() TO authenticated;
CREATE FUNCTION api.get_dashboard_group_spending()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT private.get_dashboard_group_spending() $$;

CREATE FUNCTION private.list_group_membership_history(p_group_id uuid, p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.group_memberships gm
    WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid() AND gm.removed_at IS NULL) THEN
    RAISE EXCEPTION 'group_access_denied' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(item ORDER BY membership_id), '[]'::jsonb) INTO result
  FROM (
    SELECT gm.membership_id, pg_catalog.jsonb_build_object(
      'membership_id', gm.membership_id, 'user_id', p.user_id, 'username', p.username,
      'display_name', p.display_name, 'role', gm.member_role, 'joined_at', gm.joined_at::text,
      'removed_at', gm.removed_at::text, 'removed_by', gm.removed_by
    ) AS item
    FROM app.group_memberships gm JOIN app.profiles p USING (user_id)
    WHERE gm.group_id = p_group_id AND (p_after_id IS NULL OR gm.membership_id > p_after_id)
    ORDER BY gm.membership_id LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) page;
  RETURN result;
END
$function$;
ALTER FUNCTION private.list_group_membership_history(uuid, uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_group_membership_history(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_group_membership_history(uuid, uuid, integer) TO authenticated;
CREATE FUNCTION api.list_group_membership_history(p_group_id uuid, p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT private.list_group_membership_history(p_group_id, p_after_id, p_limit) $$;

CREATE FUNCTION private.recurring_success_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, private
AS $function$
DECLARE member record; bill_title text;
BEGIN
  IF NEW.status <> 'SUCCESS' THEN RETURN NEW; END IF;
  SELECT v.title INTO bill_title FROM app.recurring_templates t
  JOIN app.recurring_template_versions v ON v.template_id = t.template_id AND v.version_no = t.current_version_no
  WHERE t.template_id = NEW.template_id;
  FOR member IN SELECT gm.user_id FROM app.recurring_templates t
    JOIN app.group_memberships gm ON gm.group_id = t.group_id AND gm.removed_at IS NULL
    WHERE t.template_id = NEW.template_id ORDER BY gm.user_id
  LOOP
    PERFORM private.enqueue_notification(member.user_id, 'RECURRING', 'BILL_ADDED',
      'Recurring bill added', bill_title || ' was added for ' || NEW.billing_cycle_date::text || '.',
      'recurring-success:' || NEW.template_id::text || ':' || NEW.billing_cycle_date::text);
  END LOOP;
  RETURN NEW;
END
$function$;
ALTER FUNCTION private.recurring_success_notification() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.recurring_success_notification() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER recurring_success_notification AFTER INSERT OR UPDATE OF status ON app.recurring_billing_runs
  FOR EACH ROW WHEN (NEW.status = 'SUCCESS') EXECUTE FUNCTION private.recurring_success_notification();

CREATE FUNCTION private.enqueue_recurring_due_soon_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth, private
AS $function$
DECLARE template_row record; member record; sent integer := 0; due_date date := private.billing_date() + 1;
BEGIN
  FOR template_row IN SELECT t.template_id, t.group_id, t.next_run_date, v.title
    FROM app.recurring_templates t JOIN app.recurring_template_versions v
      ON v.template_id = t.template_id AND v.version_no = t.current_version_no
    WHERE t.is_active AND t.next_run_date = due_date ORDER BY t.template_id
  LOOP
    FOR member IN SELECT gm.user_id FROM app.group_memberships gm
      WHERE gm.group_id = template_row.group_id AND gm.removed_at IS NULL ORDER BY gm.user_id
    LOOP
      PERFORM private.enqueue_notification(member.user_id, 'RECURRING', 'BILL_DUE_SOON',
        'Recurring bill tomorrow', template_row.title || ' is scheduled for ' || due_date::text || '.',
        'recurring-due:' || template_row.template_id::text || ':' || due_date::text);
      sent := sent + 1;
    END LOOP;
  END LOOP;
  RETURN sent;
END
$function$;
ALTER FUNCTION private.enqueue_recurring_due_soon_notifications() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.enqueue_recurring_due_soon_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enqueue_recurring_due_soon_notifications() TO postgres;

CREATE FUNCTION private.run_recurring_worker()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private
AS $function$
DECLARE processed integer; reminders integer;
BEGIN
  PERFORM private.lock_financial_writes();
  processed := private.process_due_recurring_bills(50);
  reminders := private.enqueue_recurring_due_soon_notifications();
  RETURN pg_catalog.jsonb_build_object('processed_occurrences', processed, 'due_soon_notifications', reminders);
END
$function$;
ALTER FUNCTION private.run_recurring_worker() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.run_recurring_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.run_recurring_worker() TO postgres;

CREATE OR REPLACE FUNCTION api.list_payment_reports(p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
AS $$ SELECT private.list_payment_reports(p_after_created_at, p_after_id, p_limit) $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO authenticated;
