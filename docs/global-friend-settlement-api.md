# Global friend settlement API

The global settlement API proposes payments across active friend links, including obligations from different groups. PostgreSQL builds the plan and calculates every amount. NoBroke does not move money. A debtor reports an outside payment, and only its creditor can confirm receipt and apply the linked ledger reductions.

## Per-account setting

Each account's `global_netting_preferences.enabled` defaults to `true`. A user can change only their own preference. A plan includes only active friends who have not turned global netting off. Trust limits do not apply because the operation only clears existing obligations and never creates or increases debt. Turning netting off blocks new plans, while an already accepted plan remains available for its pending transfers.

```ts
await supabase.schema("api").rpc("set_global_netting_preference", {
  p_enabled: true,
})

const { data: preference } = await supabase.schema("api").rpc("get_global_netting_preference")
// { enabled: true }
```

The Friends & Trust screen shows whether each active friend has global netting enabled. A user can turn it off at any time. The preference reveals no income or private financial data.

## Preview and accept

Preview is read-only with respect to obligations and reservations. Each request uses a UUID, and retrying that UUID returns the original preview. The server also reuses a creator's existing unexpired preview when another request arrives, so repeated taps cannot create duplicate plans. A preview expires after five minutes. Acceptance checks friendship, consent, source versions, and active reservations again; a stale preview must be cancelled or declined before generating a fresh one.

```ts
const { data: plan } = await supabase.schema("api").rpc("preview_global_settlement", {
  p_request_id: crypto.randomUUID(),
})

await supabase.schema("api").rpc("accept_global_settlement_plan", {
  p_plan_id: plan.plan_id,
})
```

Before acceptance, the creator can cancel their preview and any involved friend can decline it. Either action cancels its unreserved planned transfers without changing obligations. The audit event remains, while cancelled previews disappear from the active plan list.

```ts
await supabase.schema("api").rpc("cancel_global_settlement_plan", {
  p_plan_id: plan.plan_id,
})
```

For the approved example, the server returns one `25.00` transfer from the user to Harsh. The plan also carries source allocations for the underlying group debts. In that example, confirmation clears one `25.00` `PATH_CLEAR` allocation and three `25.00` `CYCLE_CLEAR` allocations. The cycle rows are ledger netting, not extra cash payments.

The response is scoped to the caller: it returns transfers the caller pays or receives, plus transfers whose source obligations include the caller. Each allocation includes the original group, expense, obligation, parties, kind, and decimal-string amount.

## Report and resolve an outside payment

After paying the named creditor outside NoBroke, the debtor reports the transfer. Reuse the same request UUID if the request needs retrying. The source debts stay reserved and unchanged while the transfer is pending.

```ts
await supabase.schema("api").rpc("report_global_settlement_transfer", {
  p_transfer_id: transferId,
  p_request_id: crypto.randomUUID(),
})
```

Only the transfer's creditor can confirm or reject it. Confirmation applies that transfer package's path-payment and cycle-net allocations atomically. The active friendship for every source obligation is checked again before a payment is reported and before its recipient confirms it. If a link is blocked after reporting, confirmation fails and the transfer stays reserved until the debtor cancels or the creditor rejects it; the friends can also restore the link before confirmation. Rejection releases the reservation without changing debt. Confirmed records are immutable and retries never apply the package twice.

An accepted or pending global allocation also blocks voiding or replacing its source expense. The allocation must first be cancelled, rejected, or confirmed, preserving the expense and group lineage used by the plan.

```ts
await supabase.schema("api").rpc("confirm_global_settlement_transfer", {
  p_transfer_id: transferId,
})
// Alternative creditor action: reject_global_settlement_transfer
// Debtor action before confirmation: cancel_global_settlement_transfer
```

`list_global_settlement_plans` and `list_global_settlement_history` support timestamp-and-UUID cursors. The Settle Up screen follows every page so recent previews cannot hide an older accepted transfer. The API contract and database RPC argument types are in `backend/src/api-contract.ts` and `backend/src/database.types.ts`.

## Errors and current limits

- `global_netting_disabled`: turn global netting on before previewing.
- `global_settlement_no_eligible_debts`: no connected eligible obligations remain.
- `global_settlement_no_payment_required`: the eligible graph has no net cash transfer. The current MVP leaves the debts unchanged because no creditor confirmation can authorize a payment package.
- `global_settlement_too_large`: the planner limit is 50 friends and 250 obligations.
- `stale_global_settlement_preview` or `stale_global_settlement_plan`: balances, eligibility, or reservations changed; reload and preview again.
- `active_friendship_required`: a source friendship was blocked; do not report or confirm until it is active again. A pending transfer can be cancelled by its debtor or rejected by its creditor to release reservations.
- `global_settlement_creator_required`: only the preview's creator can accept it.
- `debtor_required` or `creditor_required`: only the named transfer parties can report, resolve, or cancel.
- `expense_correction_forbidden`: an expense is still referenced by a payment, route, settlement, or active global reservation.

The planner guarantees value conservation and the single-payment result for the documented example. It does not guarantee the fewest possible transfer count for every network.

## Verification and migration order

The global-settlement and group-invite migrations are now applied to hosted Supabase. Local migration filenames match the versions recorded in hosted migration history: `20261023184217_net_peer_payment_limit.sql`, `20261023184344_check_username_availability.sql`, `20261023184400_friendship_realtime_participants.sql`, `20261023184429_global_friend_settlement.sql`, `20261023184503_group_invite_controls.sql`, and `20261023185200_replace_executor_auth_uid_after_followup_migrations.sql`. No Docker-based local stack is required for the database suite; `backend/test/database.test.mjs` replays the migrations in PGlite.

From `backend/`, run:

```powershell
npm test
npm run typecheck
```

From `frontend/`, run:

```powershell
npm test
npm run build
```

The SQL file `backend/supabase/tests/database_contract.test.sql` contains the hosted pgTAP contract checks. Run it against the intended Supabase database when its migration is applied through the team's approved rollout process.
