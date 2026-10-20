import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = resolve(root, 'supabase/migrations');
const firstUser = 'd4bd8698-3510-4ca7-9b4f-a81514a0c9b0';
const secondUser = '55a6be90-6386-41c2-96e2-f610431cc5eb';
const thirdUser = '47e90c21-b808-4d5f-b44e-15da50286c74';

async function createDatabase({ installHooks = false } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });

  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE authenticator NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE SCHEMA cron;
    CREATE FUNCTION cron.schedule(text, text, text) RETURNS bigint
      LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE FUNCTION cron.unschedule(text) RETURNS boolean
      LANGUAGE sql AS $$ SELECT true $$;
  `);

  const migrations = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  assert.ok(migrations.length > 0, 'Supabase migrations must exist');
  for (const migration of migrations) {
    await db.exec(await readFile(resolve(migrationDirectory, migration), 'utf8'));
  }

  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ($1, 'one@example.test', '{"username":"one"}'),
      ($2, 'two@example.test', '{"username":"two"}'),
      ($3, 'three@example.test', '{"username":"three"}')`,
    [firstUser, secondUser, thirdUser],
  );

  if (installHooks) await installTestHooks(db);
  return db;
}

async function installTestHooks(db) {
  await db.exec(`
    CREATE SCHEMA test_hooks;
    CREATE TABLE test_hooks.obligation_calls (expense_id uuid PRIMARY KEY);
    CREATE TABLE test_hooks.void_calls (expense_id uuid PRIMARY KEY);
    CREATE FUNCTION private.post_expense_obligations(uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, test_hooks AS $$
      BEGIN INSERT INTO test_hooks.obligation_calls VALUES ($1); END
    $$;
    CREATE FUNCTION private.void_expense_obligations(uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, test_hooks AS $$
      BEGIN INSERT INTO test_hooks.void_calls VALUES ($1); END
    $$;
    CREATE FUNCTION private.assert_member_can_leave(uuid, uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$ SELECT $$;
  `);
}

async function actAs(db, userId, action) {
  await db.exec('BEGIN');
  try {
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await action();
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

async function rpc(db, userId, functionName, args = {}) {
  return actAs(db, userId, async () => {
    const placeholders = Object.keys(args).map((key, index) => `$${index + 1}`).join(', ');
    const values = Object.values(args);
    return db.query(`SELECT api.${functionName}(${placeholders}) AS result`, values);
  });
}

async function createGroup(db, userId = firstUser, name = 'Housemates') {
  const { rows } = await rpc(db, userId, 'create_group', { p_name: name });
  return rows[0].result.group_id;
}

async function addMember(db, groupId, userId) {
  const { rows: inviteRows } = await rpc(db, firstUser, 'create_group_invite', {
    p_group_id: groupId,
  });
  await rpc(db, userId, 'accept_group_invite', { p_token: inviteRows[0].result.token });
}

test('signups create minimal private profiles without accepting auth metadata as authorization', async () => {
  const db = await createDatabase();
  try {
    const { rows: profileRows } = await db.query(
      'SELECT user_id, username FROM app.profiles ORDER BY username',
    );
    assert.deepEqual(profileRows, [
      { user_id: firstUser, username: 'one' },
      { user_id: thirdUser, username: 'three' },
      { user_id: secondUser, username: 'two' },
    ]);
    const { rows: roles } = await db.query(`
      SELECT member_role FROM app.group_memberships WHERE user_id = $1`, [firstUser]);
    assert.deepEqual(roles, []);
  } finally {
    await db.close();
  }
});

test('group creation gives caller ownership and exposes no direct financial table reads', async () => {
  const db = await createDatabase();
  try {
    const groupId = await createGroup(db);
    assert.ok(groupId);
    const { rows } = await db.query(`
      SELECT member_role FROM app.group_memberships WHERE group_id = $1 AND user_id = $2`,
      [groupId, firstUser],
    );
    assert.deepEqual(rows, [{ member_role: 'OWNER' }]);
    const { rows: rawIncomeGrant } = await db.query(`
      SELECT has_table_privilege('authenticated', 'app.user_private_financials', 'SELECT')
        AS can_read`);
    assert.deepEqual(rawIncomeGrant, [{ can_read: false }]);
  } finally {
    await db.close();
  }
});

test('income endpoint stores tier only and rejects peer SELECT', async () => {
  const db = await createDatabase();
  try {
    await rpc(db, firstUser, 'set_private_income', { p_monthly_income: '25000.00' });
    const { rows: bands } = await db.query(
      'SELECT user_id, band_weight FROM app.user_private_financials',
    );
    assert.deepEqual(bands, [{ user_id: firstUser, band_weight: '1.35' }]);
    await assert.rejects(
      db.query('SELECT monthly_income FROM app.user_private_financials'),
      /column "monthly_income" does not exist|does not exist/i,
    );
    await assert.rejects(
      actAs(db, secondUser, () => db.query('SELECT * FROM app.user_private_financials')),
      /permission denied|row-level security|violates row-level security/i,
    );
    await assert.rejects(
      actAs(db, firstUser, () => db.query('SELECT * FROM app.user_private_financials')),
      /permission denied|row-level security|violates row-level security/i,
    );
    const { rows: statusRows } = await rpc(db, firstUser, 'get_private_income_status');
    assert.deepEqual(statusRows[0].result, { configured: true });
    const { rows: clearRows } = await rpc(db, firstUser, 'clear_private_income');
    assert.deepEqual(clearRows[0].result, { configured: false, cleared: true });
    const { rows: clearedStatus } = await rpc(db, firstUser, 'get_private_income_status');
    assert.deepEqual(clearedStatus[0].result, { configured: false });
    await assert.rejects(
      rpc(db, firstUser, 'set_private_income', { p_monthly_income: 'NaN' }),
      /invalid_monthly_income/i,
    );
  } finally {
    await db.close();
  }
});

test('income boundaries map to four private weights and preserve no raw salary', async () => {
  const db = await createDatabase();
  try {
    await rpc(db, firstUser, 'set_private_income', { p_monthly_income: '24999.99' });
    await rpc(db, secondUser, 'set_private_income', { p_monthly_income: '25000.00' });
    await rpc(db, thirdUser, 'set_private_income', { p_monthly_income: '50000.00' });
    let { rows } = await db.query(`
      SELECT user_id, band_weight FROM app.user_private_financials ORDER BY user_id`);
    assert.deepEqual(rows, [
      { user_id: firstUser, band_weight: '1.00' },
      { user_id: thirdUser, band_weight: '1.75' },
      { user_id: secondUser, band_weight: '1.35' },
    ].sort((a, b) => a.user_id.localeCompare(b.user_id)));
    await rpc(db, firstUser, 'set_private_income', { p_monthly_income: '100000.00' });
    ({ rows } = await db.query(
      'SELECT band_weight FROM app.user_private_financials WHERE user_id = $1', [firstUser],
    ));
    assert.deepEqual(rows, [{ band_weight: '2.25' }]);
    const { rows: columns } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'user_private_financials'
      ORDER BY ordinal_position`);
    assert.deepEqual(columns.map((row) => row.column_name), ['user_id', 'band_weight', 'configured_at']);
  } finally {
    await db.close();
  }
});

test('expense retry is idempotent, largest-remainder shares conserve paise, and payer may be outside split', async () => {
  const db = await createDatabase({ installHooks: true });
  try {
    const groupId = await createGroup(db);
    await addMember(db, groupId, secondUser);
    await addMember(db, groupId, thirdUser);
    const requestId = 'e6ff7113-d019-47b9-bb31-83298fb8c232';
    const input = {
      p_group_id: groupId,
      p_title: 'Dinner',
      p_total_amount: '100.00',
      p_split_mode: 'EQUAL',
      p_paid_by: firstUser,
      p_participants: [firstUser, secondUser, thirdUser],
      p_request_id: requestId,
    };
    const { rows: created } = await rpc(db, firstUser, 'create_expense', input);
    const expenseId = created[0].result.expense_id;
    const { rows: retry } = await rpc(db, firstUser, 'create_expense', input);
    assert.equal(retry[0].result.expense_id, expenseId);
    await assert.rejects(
      rpc(db, firstUser, 'create_expense', { ...input, p_total_amount: '101.00' }),
      /idempotency_conflict/i,
    );
    const { rows: shares } = await db.query(`
      SELECT participant_id, share_amount::text AS share_amount
      FROM app.expense_splits WHERE expense_id = $1 ORDER BY participant_id`, [expenseId]);
    assert.deepEqual(shares, [
      { participant_id: thirdUser, share_amount: '33.34' },
      { participant_id: secondUser, share_amount: '33.33' },
      { participant_id: firstUser, share_amount: '33.33' },
    ]);
    const { rows: totals } = await db.query(`
      SELECT sum(share_amount)::text AS total FROM app.expense_splits WHERE expense_id = $1`,
    [expenseId]);
    assert.equal(totals[0].total, '100.00');
    const { rows: hookCalls } = await db.query('SELECT count(*)::int AS count FROM test_hooks.obligation_calls');
    assert.deepEqual(hookCalls, [{ count: 1 }]);
    const { rows: payerOutsideSplit } = await rpc(db, firstUser, 'create_expense', {
      ...input,
      p_title: 'Payer outside split',
      p_participants: [secondUser, thirdUser],
      p_request_id: '87c688e5-1db4-409c-b2b5-2ed55259b12a',
    });
    const { rows: outsideShares } = await db.query(
      'SELECT participant_id FROM app.expense_splits WHERE expense_id = $1 ORDER BY participant_id',
      [payerOutsideSplit[0].result.expense_id],
    );
    assert.deepEqual(outsideShares.map((row) => row.participant_id), [thirdUser, secondUser]);
    const { rows: exactExpense } = await rpc(db, firstUser, 'create_expense', {
      ...input,
      p_title: 'Exact allocation',
      p_split_mode: 'EXACT',
      p_exact_shares: { [firstUser]: '20.00', [secondUser]: '30.00', [thirdUser]: '50.00' },
      p_request_id: '55f05ad4-8cb3-4b99-9a8d-91546f6af950',
    });
    const { rows: exactRows } = await db.query(`
      SELECT sum(share_amount)::text AS total FROM app.expense_splits WHERE expense_id = $1`,
    [exactExpense[0].result.expense_id]);
    assert.equal(exactRows[0].total, '100.00');
  } finally {
    await db.close();
  }
});

test('invite tokens are one use, repeated acceptance is safe, and ownership transfer changes permissions', async () => {
  const db = await createDatabase();
  try {
    const groupId = await createGroup(db);
    const { rows: inviteRows } = await rpc(db, firstUser, 'create_group_invite', { p_group_id: groupId });
    const token = inviteRows[0].result.token;
    await rpc(db, secondUser, 'accept_group_invite', { p_token: token });
    const { rows: acceptedAgain } = await rpc(db, secondUser, 'accept_group_invite', { p_token: token });
    assert.equal(acceptedAgain[0].result.group_id, groupId);
    await assert.rejects(
      rpc(db, thirdUser, 'accept_group_invite', { p_token: token }),
      /invalid_or_expired_invite/i,
    );
    const { rows: expiringInvite } = await rpc(db, firstUser, 'create_group_invite', { p_group_id: groupId });
    await db.query(`UPDATE app.group_invites
      SET created_at = clock_timestamp() - interval '9 days',
          expires_at = clock_timestamp() - interval '1 second'
      WHERE invite_id = $1`, [expiringInvite[0].result.invite_id]);
    await assert.rejects(
      rpc(db, thirdUser, 'accept_group_invite', { p_token: expiringInvite[0].result.token }),
      /invalid_or_expired_invite/i,
    );
    await rpc(db, firstUser, 'transfer_group_ownership', {
      p_group_id: groupId, p_new_owner_id: secondUser,
    });
    await assert.rejects(
      rpc(db, firstUser, 'rename_group', { p_group_id: groupId, p_name: 'Should fail' }),
      /group_owner_required/i,
    );
    const { rows: renamed } = await rpc(db, secondUser, 'rename_group', {
      p_group_id: groupId, p_name: 'Renamed by new owner',
    });
    assert.equal(renamed[0].result.group_id, groupId);
  } finally {
    await db.close();
  }
});

test('void and replace keep immutable expense history, reject changed retries, and link both records', async () => {
  const db = await createDatabase({ installHooks: true });
  try {
    const groupId = await createGroup(db);
    await addMember(db, groupId, secondUser);
    const originalRequest = '0a986e3a-4652-4d35-a7dc-3e75bb607003';
    const { rows: original } = await rpc(db, firstUser, 'create_expense', {
      p_group_id: groupId, p_title: 'Old amount', p_total_amount: '80.00',
      p_split_mode: 'EQUAL', p_paid_by: firstUser, p_participants: [firstUser, secondUser],
      p_request_id: originalRequest,
    });
    const originalId = original[0].result.expense_id;
    const correction = {
      p_expense_id: originalId,
      p_reason: 'Corrected receipt total',
      p_group_id: groupId,
      p_title: 'Corrected amount',
      p_total_amount: '90.00',
      p_split_mode: 'EQUAL',
      p_paid_by: firstUser,
      p_participants: [firstUser, secondUser],
      p_request_id: 'e7a5434d-b8d7-40d3-a584-8e2ecfc3e723',
    };
    const { rows: replaced } = await rpc(db, firstUser, 'replace_expense', correction);
    const replacementId = replaced[0].result.expense_id;
    const { rows: retry } = await rpc(db, firstUser, 'replace_expense', correction);
    assert.equal(retry[0].result.expense_id, replacementId);
    await assert.rejects(
      rpc(db, firstUser, 'replace_expense', { ...correction, p_total_amount: '91.00' }),
      /idempotency_conflict/i,
    );
    await assert.rejects(
      db.query('UPDATE app.expenses SET title = $2 WHERE expense_id = $1', [replacementId, 'Tampered']),
      /expense_history_is_immutable/i,
    );
    await assert.rejects(
      db.query('DELETE FROM app.expenses WHERE expense_id = $1', [replacementId]),
      /expense_history_is_immutable/i,
    );
    const { rows: lineage } = await db.query(`
      SELECT expense_id, status, replaces_expense_id, replaced_by_expense_id, correction_reason
      FROM app.expenses WHERE expense_id = ANY($1::uuid[]) ORDER BY expense_id`,
    [[originalId, replacementId]]);
    assert.equal(lineage.length, 2);
    const originalRow = lineage.find((row) => row.expense_id === originalId);
    const replacementRow = lineage.find((row) => row.expense_id === replacementId);
    assert.equal(originalRow.status, 'VOIDED');
    assert.equal(originalRow.replaced_by_expense_id, replacementId);
    assert.equal(originalRow.correction_reason, 'Corrected receipt total');
    assert.equal(replacementRow.status, 'POSTED');
    assert.equal(replacementRow.replaces_expense_id, originalId);
    const { rows: voidCalls } = await db.query('SELECT count(*)::int AS count FROM test_hooks.void_calls');
    assert.deepEqual(voidCalls, [{ count: 1 }]);
  } finally {
    await db.close();
  }
});

test('income split requires three configured members and uses private weights at posting time', async () => {
  const db = await createDatabase({ installHooks: true });
  try {
    const groupId = await createGroup(db);
    await addMember(db, groupId, secondUser);
    await addMember(db, groupId, thirdUser);
    await rpc(db, firstUser, 'set_private_income', { p_monthly_income: '10000.00' });
    await rpc(db, secondUser, 'set_private_income', { p_monthly_income: '30000.00' });
    await rpc(db, thirdUser, 'set_private_income', { p_monthly_income: '70000.00' });

    await assert.rejects(rpc(db, firstUser, 'create_expense', {
      p_group_id: groupId, p_title: 'Two person income split', p_total_amount: '100.00',
      p_split_mode: 'INCOME_RATIO', p_paid_by: firstUser,
      p_participants: [firstUser, secondUser], p_request_id: '4f9c5337-0112-4a10-b7a4-938c9d527d58',
    }), /income_split_requires_three_participants/i);

    const { rows: expenseRows } = await rpc(db, firstUser, 'create_expense', {
      p_group_id: groupId, p_title: 'Income split', p_total_amount: '100.00',
      p_split_mode: 'INCOME_RATIO', p_paid_by: firstUser,
      p_participants: [firstUser, secondUser, thirdUser],
      p_request_id: '7f0297c4-50fc-4a43-8dc4-57c51fc44840',
    });
    const expenseId = expenseRows[0].result.expense_id;
    await rpc(db, thirdUser, 'clear_private_income');
    await assert.rejects(rpc(db, firstUser, 'create_expense', {
      p_group_id: groupId, p_title: 'Missing band', p_total_amount: '100.00',
      p_split_mode: 'INCOME_RATIO', p_paid_by: firstUser,
      p_participants: [firstUser, secondUser, thirdUser],
      p_request_id: 'e0d17e7e-2818-4f2c-9ffc-0b1d0be694f7',
    }), /income_setup_required/i);
    await rpc(db, firstUser, 'set_private_income', { p_monthly_income: '200000.00' });
    const { rows: originalShares } = await db.query(`
      SELECT share_amount::text AS share_amount FROM app.expense_splits
      WHERE expense_id = $1 ORDER BY participant_id`, [expenseId]);
    assert.deepEqual(originalShares.map((row) => row.share_amount), ['42.68', '32.93', '24.39']);
  } finally {
    await db.close();
  }
});

test('expense writes roll back completely when the Person 3 obligation hook is not integrated', async () => {
  const db = await createDatabase();
  try {
    const groupId = await createGroup(db);
    await assert.rejects(rpc(db, firstUser, 'create_expense', {
      p_group_id: groupId, p_title: 'Must roll back', p_total_amount: '12.00',
      p_split_mode: 'EQUAL', p_paid_by: firstUser, p_participants: [firstUser],
      p_request_id: '94088e42-e9a8-40dd-a736-11ca9d88e2c0',
    }), /financial_integration_not_ready/i);
    for (const table of ['expenses', 'expense_splits', 'expense_audit']) {
      const { rows } = await db.query(`SELECT count(*)::int AS count FROM app.${table}`);
      assert.equal(rows[0].count, 0, `${table} must roll back with the missing hook`);
    }
  } finally {
    await db.close();
  }
});

test('recurring date anchors clamp month ends and leap days without drifting', async () => {
  const db = await createDatabase();
  try {
    const { rows } = await db.query(`
      SELECT
        private.next_recurring_date('2026-01-31', 'MONTHLY', '2026-01-31')::text AS february,
        private.next_recurring_date('2026-01-31', 'MONTHLY', '2026-02-28')::text AS march,
        private.next_recurring_date('2024-02-29', 'YEARLY', '2024-02-29')::text AS next_year,
        private.next_recurring_date('2024-02-29', 'YEARLY', '2025-02-28')::text AS year_after,
        private.next_recurring_date('2026-01-01', 'WEEKLY', '2026-01-01')::text AS next_week`);
    assert.deepEqual(rows, [{
      february: '2026-02-28',
      march: '2026-03-31',
      next_year: '2025-02-28',
      year_after: '2026-02-28',
      next_week: '2026-01-08',
    }]);
  } finally {
    await db.close();
  }
});

test('recurring worker continues after sanitized failures, retries the same date once, and reports backlog', async () => {
  const db = await createDatabase();
  try {
    const groupId = await createGroup(db);
    await addMember(db, groupId, secondUser);
    const { rows: todayRows } = await db.query('SELECT private.billing_date()::text AS today');
    const startDate = new Date(`${todayRows[0].today}T00:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - 6);
    const dueDate = startDate.toISOString().slice(0, 10);
    const firstStart = dueDate;
    const secondStart = dueDate;
    const templateInputs = {
      p_group_id: groupId,
      p_title: 'Rent',
      p_total_amount: '1200.00',
      p_split_mode: 'EQUAL',
      p_frequency: 'WEEKLY',
      p_start_date: firstStart,
      p_paid_by: firstUser,
      p_participants: [firstUser, secondUser],
    };
    const { rows: firstTemplate } = await rpc(db, firstUser, 'create_recurring_template', templateInputs);
    const { rows: secondTemplate } = await rpc(db, firstUser, 'create_recurring_template', {
      ...templateInputs, p_title: 'Internet', p_start_date: secondStart,
    });
    const firstId = firstTemplate[0].result.template_id;
    const secondId = secondTemplate[0].result.template_id;

    const { rows: failedBatch } = await db.query('SELECT private.process_due_recurring_bills(50)::int AS count');
    assert.equal(failedBatch[0].count, 2);
    const { rows: failures } = await db.query(`
      SELECT template_id, status, billing_cycle_date::text AS billing_cycle_date, error_code
      FROM app.recurring_billing_runs ORDER BY template_id`);
    assert.deepEqual(failures, [firstId, secondId].sort().map((template_id) => ({
      template_id, status: 'FAILED', billing_cycle_date: dueDate,
      error_code: 'financial_integration_not_ready',
    })));
    const { rows: beforeRetry } = await db.query(`
      SELECT next_run_date::text AS next_run_date, failed_date::text AS failed_date
      FROM app.recurring_templates WHERE template_id = $1`, [firstId]);
    assert.deepEqual(beforeRetry, [{ next_run_date: dueDate, failed_date: dueDate }]);

    await installTestHooks(db);
    const { rows: retryBatch } = await db.query('SELECT private.process_due_recurring_bills(50)::int AS count');
    assert.equal(retryBatch[0].count, 2);
    const { rows: runs } = await db.query(`
      SELECT template_id, status, count(*) OVER (PARTITION BY template_id)::int AS run_count
      FROM app.recurring_billing_runs ORDER BY template_id`);
    assert.deepEqual(runs, [firstId, secondId].sort().map((template_id) => ({
      template_id, status: 'SUCCESS', run_count: 1,
    })));
    const { rows: recurringExpenses } = await db.query(`
      SELECT source_template_id, billing_cycle_date::text AS billing_cycle_date,
        total_amount::text AS total_amount
      FROM app.expenses WHERE source_type = 'RECURRING' ORDER BY source_template_id`);
    assert.deepEqual(recurringExpenses, [firstId, secondId].sort().map((source_template_id) => ({
      source_template_id, billing_cycle_date: dueDate, total_amount: '1200.00',
    })));
    const { rows: listRows } = await rpc(db, firstUser, 'list_recurring_templates', {
      p_group_id: groupId,
    });
    assert.equal(listRows[0].result.length, 2);
    assert.equal(listRows[0].result[0].backlog_count, 0);
    const { rows: unchanged } = await db.query(`
      SELECT next_run_date::text AS next_run_date, last_success_date::text AS last_success_date,
        failed_date, last_error_code
      FROM app.recurring_templates WHERE template_id = $1`, [firstId]);
    const expectedNextDate = new Date(`${dueDate}T00:00:00Z`);
    expectedNextDate.setUTCDate(expectedNextDate.getUTCDate() + 7);
    assert.deepEqual(unchanged, [{
      next_run_date: expectedNextDate.toISOString().slice(0, 10),
      last_success_date: dueDate,
      failed_date: null,
      last_error_code: null,
    }]);
  } finally {
    await db.close();
  }
});

test('recurring edits are versioned for a future billing date, pauses persist, and active bills block departure', async () => {
  const db = await createDatabase();
  try {
    const groupId = await createGroup(db);
    await addMember(db, groupId, secondUser);
    const { rows: todayRows } = await db.query('SELECT private.billing_date()::text AS today');
    const startDate = new Date(`${todayRows[0].today}T00:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - 14);
    const dueDate = startDate.toISOString().slice(0, 10);
    const { rows: created } = await rpc(db, firstUser, 'create_recurring_template', {
      p_group_id: groupId, p_title: 'Utilities', p_total_amount: '900.00',
      p_split_mode: 'EQUAL', p_frequency: 'WEEKLY', p_start_date: dueDate,
      p_paid_by: firstUser, p_participants: [firstUser, secondUser],
    });
    const templateId = created[0].result.template_id;
    const updateInput = {
      p_template_id: templateId, p_title: 'Utilities updated', p_total_amount: '1000.00',
      p_split_mode: 'EQUAL', p_frequency: 'MONTHLY', p_paid_by: firstUser,
      p_participants: [firstUser, secondUser],
    };
    await assert.rejects(
      rpc(db, secondUser, 'update_recurring_template', updateInput),
      /template_manager_required/i,
    );
    const { rows: updated } = await rpc(db, firstUser, 'update_recurring_template', updateInput);
    const effectiveDate = new Date(`${todayRows[0].today}T00:00:00Z`);
    effectiveDate.setUTCDate(effectiveDate.getUTCDate() + 7);
    assert.equal(updated[0].result.effective_from, effectiveDate.toISOString().slice(0, 10));
    const { rows: versions } = await db.query(`
      SELECT version_no, effective_from::text AS effective_from, effective_to::text AS effective_to,
        title, total_amount::text AS total_amount, frequency
      FROM app.recurring_template_versions WHERE template_id = $1 ORDER BY version_no`, [templateId]);
    assert.deepEqual(versions, [
      { version_no: 1, effective_from: dueDate, effective_to: new Date(effectiveDate.getTime() - 86400000).toISOString().slice(0, 10), title: 'Utilities', total_amount: '900.00', frequency: 'WEEKLY' },
      { version_no: 2, effective_from: effectiveDate.toISOString().slice(0, 10), effective_to: null, title: 'Utilities updated', total_amount: '1000.00', frequency: 'MONTHLY' },
    ]);
    await assert.rejects(
      rpc(db, secondUser, 'leave_group', { p_group_id: groupId }),
      /active_recurring_bills_block_departure/i,
    );
    await rpc(db, firstUser, 'pause_recurring_template', { p_template_id: templateId });
    await rpc(db, firstUser, 'resume_recurring_template', { p_template_id: templateId });
    const { rows: pauseRows } = await db.query(`
      SELECT paused_on::text AS paused_on, resumed_on::text AS resumed_on
      FROM app.recurring_template_pauses WHERE template_id = $1`, [templateId]);
    assert.deepEqual(pauseRows, [{ paused_on: todayRows[0].today, resumed_on: todayRows[0].today }]);
  } finally {
    await db.close();
  }
});
