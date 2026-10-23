-- Cover the seven foreign keys reported by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS global_settlement_allocations_source_expense_id_idx
  ON app.global_settlement_allocations (source_expense_id);
CREATE INDEX IF NOT EXISTS global_settlement_allocations_source_group_id_idx
  ON app.global_settlement_allocations (source_group_id);
CREATE INDEX IF NOT EXISTS global_settlement_events_actor_user_id_idx
  ON app.global_settlement_events (actor_user_id);
CREATE INDEX IF NOT EXISTS global_settlement_events_transfer_id_idx
  ON app.global_settlement_events (transfer_id);
CREATE INDEX IF NOT EXISTS global_settlement_transfers_creditor_user_id_idx
  ON app.global_settlement_transfers (creditor_user_id);
CREATE INDEX IF NOT EXISTS global_settlement_transfers_resolved_by_idx
  ON app.global_settlement_transfers (resolved_by);
CREATE INDEX IF NOT EXISTS settlement_records_global_transfer_id_idx
  ON app.settlement_records (global_transfer_id);

-- Evaluate the stable Auth identity once per statement rather than once per row.
DROP POLICY IF EXISTS friendships_participant_read ON app.friendships;
CREATE POLICY friendships_participant_read
  ON app.friendships
  FOR SELECT
  TO authenticated
  USING (
    user_a = (SELECT auth.uid())
    OR user_b = (SELECT auth.uid())
  );
