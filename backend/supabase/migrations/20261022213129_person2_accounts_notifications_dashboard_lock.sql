-- Shared account APIs, private notifications/dashboard reads, and one global
-- transaction lock acquired before any business row locks.

CREATE TABLE app.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE RESTRICT,
  reminders_enabled boolean NOT NULL DEFAULT true,
  forwarding_enabled boolean NOT NULL DEFAULT true,
  recurring_enabled boolean NOT NULL DEFAULT false,
  social_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE TABLE app.notifications (
  notification_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('REMINDERS', 'CASCADES', 'RECURRING', 'SOCIAL')),
  kind text NOT NULL CHECK (kind ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  title text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(title)) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(body)) BETWEEN 1 AND 500),
  dedupe_key text NOT NULL CHECK (pg_catalog.length(dedupe_key) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  read_at timestamptz,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX notifications_inbox_cursor
  ON app.notifications (user_id, created_at DESC, notification_id DESC);
CREATE INDEX notifications_unread
  ON app.notifications (user_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE app.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_executor ON app.notification_preferences
  TO nobroke_executor USING (true) WITH CHECK (true);
CREATE POLICY notifications_executor ON app.notifications
  TO nobroke_executor USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON app.notification_preferences TO nobroke_executor;
GRANT SELECT, INSERT, UPDATE ON app.notifications TO nobroke_executor;

-- A transaction-level global gate. Every mutation wrapper takes this before
-- its first group, template, expense, trust, or obligation row lock.
CREATE FUNCTION private.lock_financial_writes()
RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog
AS $$ SELECT pg_catalog.pg_advisory_xact_lock(1330070611, 1) $$;
REVOKE ALL ON FUNCTION private.lock_financial_writes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.lock_financial_writes() TO authenticated, nobroke_executor, postgres;

CREATE FUNCTION private.update_my_profile(p_username text, p_display_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  normalized_username text := pg_catalog.lower(pg_catalog.btrim(p_username));
  normalized_display_name text := pg_catalog.btrim(p_display_name);
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF normalized_username !~ '^[a-z0-9][a-z0-9_.-]{1,39}$'
      OR pg_catalog.length(normalized_display_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_profile';
  END IF;
  BEGIN
    UPDATE app.profiles
    SET username = normalized_username, display_name = normalized_display_name
    WHERE user_id = caller_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'username_unavailable';
  END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'user_id', caller_id, 'username', normalized_username,
    'display_name', normalized_display_name
  );
END;
$function$;
ALTER FUNCTION private.update_my_profile(text, text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.update_my_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.update_my_profile(text, text) TO authenticated;

CREATE FUNCTION private.get_notification_preferences()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
DECLARE preferences app.notification_preferences%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  SELECT * INTO preferences FROM app.notification_preferences WHERE user_id = caller_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'reminders', true, 'cascades', true, 'recurring', false, 'social', true
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'reminders', preferences.reminders_enabled,
    'cascades', preferences.forwarding_enabled,
    'recurring', preferences.recurring_enabled,
    'social', preferences.social_enabled
  );
END;
$function$;
ALTER FUNCTION private.get_notification_preferences() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.get_notification_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_notification_preferences() TO authenticated;

CREATE FUNCTION private.update_notification_preferences(p_preferences jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF pg_catalog.jsonb_typeof(p_preferences) <> 'object'
      OR p_preferences - ARRAY['reminders', 'cascades', 'recurring', 'social'] <> '{}'::jsonb
      OR pg_catalog.jsonb_typeof(p_preferences -> 'reminders') <> 'boolean'
      OR pg_catalog.jsonb_typeof(p_preferences -> 'cascades') <> 'boolean'
      OR pg_catalog.jsonb_typeof(p_preferences -> 'recurring') <> 'boolean'
      OR pg_catalog.jsonb_typeof(p_preferences -> 'social') <> 'boolean' THEN
    RAISE EXCEPTION 'invalid_notification_preferences';
  END IF;
  INSERT INTO app.notification_preferences (
    user_id, reminders_enabled, forwarding_enabled, recurring_enabled, social_enabled
  ) VALUES (
    caller_id, (p_preferences ->> 'reminders')::boolean,
    (p_preferences ->> 'cascades')::boolean, (p_preferences ->> 'recurring')::boolean,
    (p_preferences ->> 'social')::boolean
  )
  ON CONFLICT (user_id) DO UPDATE SET
    reminders_enabled = EXCLUDED.reminders_enabled,
    forwarding_enabled = EXCLUDED.forwarding_enabled,
    recurring_enabled = EXCLUDED.recurring_enabled,
    social_enabled = EXCLUDED.social_enabled,
    updated_at = pg_catalog.clock_timestamp();
  RETURN private.get_notification_preferences();
END;
$function$;
ALTER FUNCTION private.update_notification_preferences(jsonb) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.update_notification_preferences(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.update_notification_preferences(jsonb) TO authenticated;

CREATE FUNCTION private.enqueue_notification(
  p_user_id uuid, p_category text, p_kind text, p_title text, p_body text, p_dedupe_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app
AS $function$
DECLARE enabled boolean;
DECLARE new_id uuid;
BEGIN
  SELECT CASE p_category
    WHEN 'REMINDERS' THEN COALESCE(p.reminders_enabled, true)
    WHEN 'CASCADES' THEN COALESCE(p.forwarding_enabled, true)
    WHEN 'RECURRING' THEN COALESCE(p.recurring_enabled, false)
    WHEN 'SOCIAL' THEN COALESCE(p.social_enabled, true)
    ELSE false
  END
  INTO enabled
  FROM (SELECT 1) AS singleton
  LEFT JOIN app.notification_preferences AS p ON p.user_id = p_user_id;
  IF p_category NOT IN ('REMINDERS', 'CASCADES', 'RECURRING', 'SOCIAL') THEN
    RAISE EXCEPTION 'invalid_notification_category';
  END IF;
  IF NOT enabled THEN
    RETURN NULL;
  END IF;
  INSERT INTO app.notifications (user_id, category, kind, title, body, dedupe_key)
  VALUES (p_user_id, p_category, p_kind, p_title, p_body, p_dedupe_key)
  ON CONFLICT (user_id, dedupe_key) DO NOTHING
  RETURNING notification_id INTO new_id;
  RETURN new_id;
END;
$function$;
ALTER FUNCTION private.enqueue_notification(uuid, text, text, text, text, text) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.enqueue_notification(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enqueue_notification(uuid, text, text, text, text, text)
  TO nobroke_executor, postgres;

CREATE FUNCTION api.get_my_profile()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, app, auth
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'user_id', p.user_id, 'username', p.username, 'display_name', p.display_name
  )
  FROM app.profiles AS p
  WHERE p.user_id = auth.uid()
$$;

CREATE FUNCTION api.update_my_profile(p_username text, p_display_name text)
RETURNS jsonb
LANGUAGE sql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT private.update_my_profile(p_username, p_display_name) $$;

CREATE FUNCTION api.get_notification_preferences()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT private.get_notification_preferences() $$;

CREATE FUNCTION api.update_notification_preferences(p_preferences jsonb)
RETURNS jsonb
LANGUAGE sql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT private.update_notification_preferences(p_preferences) $$;

CREATE FUNCTION api.get_notification_unread_count()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  RETURN pg_catalog.to_jsonb(private.notification_unread_count());
END;
$function$;

CREATE FUNCTION private.notification_unread_count()
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  RETURN (SELECT pg_catalog.count(*)::integer
    FROM app.notifications WHERE user_id = caller_id AND read_at IS NULL);
END;
$function$;
ALTER FUNCTION private.notification_unread_count() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.notification_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.notification_unread_count() TO authenticated;

CREATE FUNCTION api.list_notifications(
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  RETURN private.list_notifications(p_after_created_at, p_after_id, p_limit);
END;
$function$;

CREATE FUNCTION private.list_notifications(
  p_after_created_at timestamptz, p_after_id uuid, p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
DECLARE result jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(page.item ORDER BY page.created_at DESC, page.notification_id DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT n.created_at, n.notification_id, pg_catalog.jsonb_build_object(
      'notification_id', n.notification_id, 'category', n.category, 'kind', n.kind,
      'title', n.title, 'body', n.body, 'created_at', n.created_at::text,
      'read_at', n.read_at::text
    ) AS item
    FROM app.notifications AS n
    WHERE n.user_id = caller_id
      AND (p_after_created_at IS NULL OR p_after_id IS NULL
        OR (n.created_at, n.notification_id) < (p_after_created_at, p_after_id))
    ORDER BY n.created_at DESC, n.notification_id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) AS page;
  RETURN result;
END;
$function$;
ALTER FUNCTION private.list_notifications(timestamptz, uuid, integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.list_notifications(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_notifications(timestamptz, uuid, integer) TO authenticated;

CREATE FUNCTION api.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  RETURN private.mark_notification_read(p_notification_id);
END;
$function$;

CREATE FUNCTION private.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
DECLARE changed boolean := false;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  UPDATE app.notifications
  SET read_at = COALESCE(read_at, pg_catalog.clock_timestamp())
  WHERE notification_id = p_notification_id AND user_id = caller_id
  RETURNING true INTO changed;
  RETURN pg_catalog.jsonb_build_object('notification_id', p_notification_id, 'read', COALESCE(changed, false));
END;
$function$;
ALTER FUNCTION private.mark_notification_read(uuid) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.mark_notification_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.mark_notification_read(uuid) TO authenticated;

CREATE FUNCTION api.mark_all_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  RETURN private.mark_all_notifications_read();
END;
$function$;

CREATE FUNCTION private.mark_all_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app, auth
AS $function$
DECLARE caller_id uuid := auth.uid();
DECLARE changed_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  UPDATE app.notifications
  SET read_at = pg_catalog.clock_timestamp()
  WHERE user_id = caller_id AND read_at IS NULL;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('updated', changed_count);
END;
$function$;
ALTER FUNCTION private.mark_all_notifications_read() OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.mark_all_notifications_read() TO authenticated;

CREATE FUNCTION api.list_my_spending(p_months integer DEFAULT 12)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, app, auth
AS $$
  WITH bounds AS (
    SELECT pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', pg_catalog.now()))::date AS this_month,
      LEAST(GREATEST(COALESCE(p_months, 12), 1), 24) AS month_count
  ), months AS (
    SELECT (b.this_month - series.month_offset * interval '1 month')::date AS month_start
    FROM bounds AS b
    CROSS JOIN LATERAL pg_catalog.generate_series(0, b.month_count - 1) AS series(month_offset)
  ), member_expenses AS (
    SELECT e.expense_id, e.group_id, e.paid_by, e.total_amount,
      pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', e.created_at))::date AS month_start
    FROM app.expenses AS e
    JOIN app.group_memberships AS gm
      ON gm.group_id = e.group_id AND gm.user_id = auth.uid() AND gm.removed_at IS NULL
    WHERE e.status = 'POSTED'
      AND e.created_at >= (SELECT pg_catalog.timezone('Asia/Kolkata', this_month - (month_count - 1) * interval '1 month') AT TIME ZONE 'Asia/Kolkata' FROM bounds)
  ), totals AS (
    SELECT month_start,
      pg_catalog.sum(total_amount) FILTER (WHERE paid_by = auth.uid()) AS you_paid,
      pg_catalog.sum(total_amount) AS group_total
    FROM member_expenses GROUP BY month_start
  ), shares AS (
    SELECT me.month_start, pg_catalog.sum(s.share_amount) AS your_share
    FROM member_expenses AS me
    JOIN app.expense_splits AS s ON s.expense_id = me.expense_id AND s.participant_id = auth.uid()
    GROUP BY me.month_start
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'month', pg_catalog.to_char(m.month_start, 'YYYY-MM'),
    'your_share', COALESCE(s.your_share, 0)::text,
    'you_paid', COALESCE(t.you_paid, 0)::text,
    'group_total', COALESCE(t.group_total, 0)::text
  ) ORDER BY m.month_start), '[]'::jsonb)
  FROM months AS m
  LEFT JOIN totals AS t USING (month_start)
  LEFT JOIN shares AS s USING (month_start)
$$;

CREATE FUNCTION api.get_dashboard_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, app, auth
AS $$
  WITH current_month AS (
    SELECT pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', pg_catalog.now()))::date AS month_start
  ), groups AS (
    SELECT gm.group_id FROM app.group_memberships AS gm
    WHERE gm.user_id = auth.uid() AND gm.removed_at IS NULL
  ), expenses AS (
    SELECT e.expense_id, e.group_id, e.paid_by, e.total_amount
    FROM app.expenses AS e JOIN groups AS g USING (group_id), current_month AS cm
    WHERE e.status = 'POSTED'
      AND pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', e.created_at))::date = cm.month_start
  )
  SELECT pg_catalog.jsonb_build_object(
    'group_count', (SELECT pg_catalog.count(*)::integer FROM groups),
    'current_month_spend', COALESCE((
      SELECT pg_catalog.sum(s.share_amount)
      FROM expenses AS e JOIN app.expense_splits AS s USING (expense_id)
      WHERE s.participant_id = auth.uid()
    ), 0)::text,
    'current_month_paid', COALESCE((
      SELECT pg_catalog.sum(e.total_amount) FROM expenses AS e WHERE e.paid_by = auth.uid()
    ), 0)::text,
    'current_month_group_total', COALESCE((SELECT pg_catalog.sum(total_amount) FROM expenses), 0)::text
  )
$$;

-- Acquire the shared lock before every Person 2 mutation wrapper can reach
-- private functions that lock group, expense, or template rows.
CREATE OR REPLACE FUNCTION api.create_group(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
DECLARE new_group_id uuid;
BEGIN
  PERFORM private.lock_financial_writes();
  new_group_id := private.create_group(p_name);
  RETURN pg_catalog.jsonb_build_object('group_id', new_group_id);
END;
$function$;

CREATE OR REPLACE FUNCTION api.rename_group(p_group_id uuid, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  PERFORM private.rename_group(p_group_id, p_name);
  RETURN pg_catalog.jsonb_build_object('group_id', p_group_id);
END;
$function$;

CREATE OR REPLACE FUNCTION api.transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  PERFORM private.transfer_group_ownership(p_group_id, p_new_owner_id);
  RETURN pg_catalog.jsonb_build_object('group_id', p_group_id);
END;
$function$;

CREATE OR REPLACE FUNCTION api.create_group_invite(p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
DECLARE result jsonb;
BEGIN
  PERFORM private.lock_financial_writes();
  result := private.create_group_invite(p_group_id);
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION api.accept_group_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
DECLARE new_group_id uuid;
BEGIN
  PERFORM private.lock_financial_writes();
  new_group_id := private.accept_group_invite(p_token);
  RETURN pg_catalog.jsonb_build_object('group_id', new_group_id);
END;
$function$;

CREATE OR REPLACE FUNCTION api.revoke_group_invite(p_invite_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  PERFORM private.revoke_group_invite(p_invite_id);
  RETURN pg_catalog.jsonb_build_object('invite_id', p_invite_id, 'revoked', true);
END;
$function$;

CREATE OR REPLACE FUNCTION api.remove_group_member(p_group_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  PERFORM private.remove_group_member(p_group_id, p_user_id);
  RETURN pg_catalog.jsonb_build_object('group_id', p_group_id, 'user_id', p_user_id, 'removed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION api.leave_group(p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  PERFORM private.leave_group(p_group_id);
  RETURN pg_catalog.jsonb_build_object('group_id', p_group_id, 'left', true);
END;
$function$;

CREATE OR REPLACE FUNCTION api.set_private_income(p_monthly_income numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  PERFORM private.set_private_income(p_monthly_income);
  RETURN pg_catalog.jsonb_build_object('configured', true);
END;
$function$;

CREATE OR REPLACE FUNCTION api.clear_private_income()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
DECLARE was_cleared boolean;
BEGIN
  PERFORM private.lock_financial_writes();
  was_cleared := private.clear_private_income();
  RETURN pg_catalog.jsonb_build_object('configured', false, 'cleared', was_cleared);
END;
$function$;

CREATE OR REPLACE FUNCTION api.create_expense(
  p_group_id uuid, p_title text, p_total_amount numeric, p_split_mode text,
  p_paid_by uuid, p_participants uuid[], p_request_id uuid, p_exact_shares jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
DECLARE new_expense_id uuid;
BEGIN
  PERFORM private.lock_financial_writes();
  new_expense_id := private.create_expense_for_request(
    p_group_id, p_title, p_total_amount, p_split_mode, p_paid_by,
    p_participants, p_exact_shares, p_request_id
  );
  RETURN pg_catalog.jsonb_build_object('expense_id', new_expense_id);
END;
$function$;

CREATE OR REPLACE FUNCTION api.void_expense(p_expense_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  PERFORM private.void_expense_for_request(p_expense_id, p_reason);
  RETURN pg_catalog.jsonb_build_object('expense_id', p_expense_id, 'status', 'VOIDED');
END;
$function$;

CREATE OR REPLACE FUNCTION api.replace_expense(
  p_expense_id uuid, p_reason text, p_group_id uuid, p_title text,
  p_total_amount numeric, p_split_mode text, p_paid_by uuid,
  p_participants uuid[], p_request_id uuid, p_exact_shares jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
DECLARE new_expense_id uuid;
BEGIN
  PERFORM private.lock_financial_writes();
  new_expense_id := private.replace_expense_for_request(
    p_expense_id, p_reason, p_group_id, p_title, p_total_amount,
    p_split_mode, p_paid_by, p_participants, p_exact_shares, p_request_id
  );
  RETURN pg_catalog.jsonb_build_object('expense_id', new_expense_id, 'replaces_expense_id', p_expense_id);
END;
$function$;

CREATE OR REPLACE FUNCTION api.create_recurring_template(
  p_group_id uuid, p_title text, p_total_amount numeric, p_split_mode text,
  p_frequency text, p_start_date date, p_paid_by uuid, p_participants uuid[],
  p_exact_shares jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
DECLARE new_template_id uuid;
BEGIN
  PERFORM private.lock_financial_writes();
  new_template_id := private.create_recurring_template_for_request(
    p_group_id, p_title, p_total_amount, p_split_mode, p_frequency,
    p_start_date, p_paid_by, p_participants, p_exact_shares
  );
  RETURN pg_catalog.jsonb_build_object('template_id', new_template_id);
END;
$function$;

CREATE OR REPLACE FUNCTION api.update_recurring_template(
  p_template_id uuid, p_title text, p_total_amount numeric, p_split_mode text,
  p_frequency text, p_paid_by uuid, p_participants uuid[], p_exact_shares jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  RETURN private.update_recurring_template_for_request(
    p_template_id, p_title, p_total_amount, p_split_mode, p_frequency,
    p_paid_by, p_participants, p_exact_shares
  );
END;
$function$;

CREATE OR REPLACE FUNCTION api.pause_recurring_template(p_template_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  RETURN private.set_recurring_template_paused(p_template_id, true);
END;
$function$;

CREATE OR REPLACE FUNCTION api.resume_recurring_template(p_template_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  RETURN private.set_recurring_template_paused(p_template_id, false);
END;
$function$;

CREATE FUNCTION private.process_due_recurring_bills_with_lock(p_batch_size integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private
AS $function$
BEGIN
  PERFORM private.lock_financial_writes();
  RETURN private.process_due_recurring_bills(p_batch_size);
END;
$function$;
ALTER FUNCTION private.process_due_recurring_bills_with_lock(integer) OWNER TO nobroke_executor;
REVOKE ALL ON FUNCTION private.process_due_recurring_bills_with_lock(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.process_due_recurring_bills_with_lock(integer) TO postgres;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION api.update_my_profile(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION api.get_notification_preferences() TO authenticated;
GRANT EXECUTE ON FUNCTION api.update_notification_preferences(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION api.get_notification_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION api.list_notifications(timestamptz, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION api.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION api.list_my_spending(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION api.get_dashboard_summary() TO authenticated;
