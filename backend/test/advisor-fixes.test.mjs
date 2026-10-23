import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const migrationDirectory = resolve(root, 'supabase/migrations');
const expectedIndexes = [
  'global_settlement_allocations_source_expense_id_idx',
  'global_settlement_allocations_source_group_id_idx',
  'global_settlement_events_actor_user_id_idx',
  'global_settlement_events_transfer_id_idx',
  'global_settlement_transfers_creditor_user_id_idx',
  'global_settlement_transfers_resolved_by_idx',
  'settlement_records_global_transfer_id_idx',
];

test('advisor migration indexes every reported foreign key and caches auth.uid in friendship RLS', async () => {
  const files = await readdir(migrationDirectory);
  const migrationName = files.find((file) => file.endsWith('_advisor_indexes_and_rls_initplan.sql'));
  assert.ok(migrationName, 'advisor migration should exist');
  const migration = await readFile(resolve(migrationDirectory, migrationName), 'utf8');

  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA app;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
      CREATE TABLE app.global_settlement_allocations (source_expense_id uuid, source_group_id uuid);
      CREATE TABLE app.global_settlement_events (actor_user_id uuid, transfer_id uuid);
      CREATE TABLE app.global_settlement_transfers (creditor_user_id uuid, resolved_by uuid);
      CREATE TABLE app.settlement_records (global_transfer_id uuid);
      CREATE TABLE app.friendships (user_a uuid, user_b uuid);
      ALTER TABLE app.friendships ENABLE ROW LEVEL SECURITY;
    `);
    await db.exec(migration);

    const { rows: indexes } = await db.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'app' AND indexname = ANY($1::text[])
       ORDER BY indexname`,
      [expectedIndexes],
    );
    assert.deepEqual(indexes.map((row) => row.indexname), [...expectedIndexes].sort());

    const { rows: policies } = await db.query(
      `SELECT qual FROM pg_policies
       WHERE schemaname = 'app' AND tablename = 'friendships'
         AND policyname = 'friendships_participant_read'`,
    );
    assert.equal(policies.length, 1);
    assert.equal((policies[0].qual.match(/select auth\.uid\(\)/gi) ?? []).length, 2);
  } finally {
    await db.close();
  }
});
