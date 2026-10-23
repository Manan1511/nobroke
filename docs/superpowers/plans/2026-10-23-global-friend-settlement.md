# Global Friend Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let active friends settle eligible debts across groups through deterministic payment plans, with global netting on by default and an opt-out for each account. Ledger changes occur only after the receiving friend confirms each external payment.

**Architecture:** PostgreSQL remains the source of truth for preference, plan construction, obligation allocations, reservations, and settlement history. The frontend previews and accepts server-generated plans, reports external payment, and presents confirmation state without calculating financial totals.

**Tech Stack:** Supabase PostgreSQL and PL/pgSQL, RLS, invoker RPC wrappers, React, TypeScript, and the existing Node test suites with PGlite.

**Spec:** `docs/superpowers/specs/2026-10-23-global-friend-settlement-design.md`

## Global Constraints

- Use active friendship links and require global netting to remain enabled for every affected account. The preference defaults on and each user can opt out.
- Never create or increase debt, and never require or consult trust limits for this feature.
- Keep INR in `NUMERIC(12,2)` and expose money as decimal strings.
- Preview or acceptance does not reduce debt; recipient confirmation does.
- Preserve expense, group, obligation, plan, transfer, and allocation lineage.
- Acquire the shared financial advisory lock before row locks, then lock groups, expenses, obligations, plans, and transfers in that order.
- Keep application tables outside PostgREST exposed schemas and keep privileged functions private.
- Do not log email, private financial data, or unrelated graph details.

## Review Focus

- A stale preview or changed preference must fail at acceptance without reserving debt.
- Existing pending payments, forwarding tasks, armed rules, and reservations must exclude affected obligations.
- Partial transfer confirmation must consume only that transfer package and leave other packages usable.
- Rejected or cancelled transfers must release their package reservations exactly once.
- A route, direct payment, correction, or departure must not consume or erase an accepted plan allocation; source expenses stay immutable while a global allocation is reserved.
- A blocked source friendship prevents report and confirmation, and the caller can see the inactive state and release actions.
- Cursor traversal keeps older accepted or pending transfers available after newer previews are created.

---

### Task 1: Persist global-netting preferences and plan records

**Files:**
- Create: `backend/supabase/migrations/<timestamp>_global_friend_settlement.sql`
- Modify: `backend/src/api-contract.ts`
- Modify: `backend/test/database.test.mjs`

**Interfaces:**
- Produce `api.get_global_netting_preference()` and `api.set_global_netting_preference(p_enabled boolean)`.
- Add private `app.global_netting_preferences`, `app.global_settlement_plans`, `app.global_settlement_participants`, `app.global_settlement_transfers`, `app.global_settlement_allocations`, and `app.global_settlement_events` tables.
- Define plan states `PREVIEW`, `ACCEPTED`, `PARTIAL`, `COMPLETED`, `CANCELLED`, `EXPIRED`; transfer states `PLANNED`, `ACCEPTED`, `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`; allocation kinds `PATH_CLEAR` and `CYCLE_CLEAR`.
- Extend the private reservation total to include allocations for accepted or pending transfer packages.

- [x] **Step 1: Write failing database tests** named `global netting defaults on, supports opt-out, and keeps preferences private` and `global settlement tables keep plan participants and allocations linked`. Assert default-on behavior, caller-only preference updates, RLS and grants, positive exact-paise amounts, and foreign keys to source obligations.
- [x] **Step 2: Run the focused tests** with `node --test --test-name-pattern="global netting|global settlement tables" test/database.test.mjs`. Expected: the tests fail because the preference RPCs and tables do not exist.
- [x] **Step 3: Add the schema, RLS policies, grants, preference RPCs, and contract types** in the migration and `backend/src/api-contract.ts`. Expose peer preference status only in the caller's authorized friend list.
- [x] **Step 4: Re-run the focused tests.** Expected: both pass, including direct-read denial for unrelated users.

### Task 2: Build deterministic cross-group settlement previews

**Files:**
- Modify: `backend/supabase/migrations/<timestamp>_global_friend_settlement.sql`
- Modify: `backend/src/api-contract.ts`
- Modify: `backend/test/database.test.mjs`

**Interfaces:**
- Add `api.preview_global_settlement(p_request_id uuid)` and `api.list_global_settlement_plans(p_after_created_at timestamptz, p_after_plan_id uuid, p_limit integer)`.
- Preview returns `plan_id`, `status`, `expires_at`, participant identities visible to the caller, transfer summaries, and source-linked allocation details. Every transfer has a stable UUID, debtor, creditor, decimal-string amount, and allocations.
- Add private `private.preview_global_settlement(uuid)` and a private deterministic planner. Remove simple directed cycles in UUID order, then decompose the remaining acyclic debt paths into exact-paise transfers. Associate cycle-clear allocations with a transfer package so each confirmed package is independently balanced.

- [x] **Step 1: Write failing tests** named `global preview nets a cross-group three-person cycle to one 25 rupee payment`, `global preview includes friends by default and excludes friends who opt out`, and `global preview omits obligations with active dependencies`. Create the debts in separate groups and assert one user-to-Harsh transfer for `25.00`, path and cycle allocations, no trust-grant requirement, and safe omission of non-eligible debts.
- [x] **Step 2: Run the focused tests.** Expected: `api.preview_global_settlement` is missing.
- [x] **Step 3: Implement the private planner and invoker wrappers.** Snapshot obligation versions and amounts, reject incomplete or ineligible friend components, exclude reserved/dependent obligations, and persist idempotent previews using the caller request UUID.
- [x] **Step 4: Re-run the focused tests.** Expected: all three pass with exact allocation totals and no debt changes during preview.

### Task 3: Accept plans and resolve confirmed transfer packages

**Files:**
- Modify: `backend/supabase/migrations/<timestamp>_global_friend_settlement.sql`
- Modify: `backend/src/api-contract.ts`
- Modify: `backend/test/database.test.mjs`

**Interfaces:**
- Add `api.accept_global_settlement_plan(p_plan_id uuid)`, `api.report_global_settlement_transfer(p_transfer_id uuid, p_request_id uuid)`, `api.confirm_global_settlement_transfer(p_transfer_id uuid)`, `api.reject_global_settlement_transfer(p_transfer_id uuid)`, and `api.cancel_global_settlement_transfer(p_transfer_id uuid)`.
- Add `api.list_global_settlement_history(...)` for transfer and allocation history visible to plan participants.
- Add private helpers that validate snapshots, reserve active allocations, apply one confirmed package atomically, write immutable global-payment and global-net records, and update plan status.

- [x] **Step 1: Write failing tests** named `accepting a global plan reserves but does not reduce debt`, `confirmed global payment applies its cash and cycle allocations exactly once`, `rejected and cancelled global transfers release reservations`, `stale or changed previews fail closed`, and `other writes cannot consume accepted global allocations`. Assert retry safety, role access, conservation, partial package resolution, lock ordering, and unchanged unrelated obligations.
- [x] **Step 2: Run the focused tests.** Expected: global plan mutation RPCs are missing.
- [x] **Step 3: Implement accept, report, confirm, reject, and cancel flows.** Every financial wrapper acquires `private.lock_financial_writes()` before row locks. Confirmation checks all reservations, revalidates friendship and source versions, reduces only that transfer's allocations, and records cash separately from non-cash netting.
- [x] **Step 4: Re-run the focused tests.** Expected: every package test passes and total value changes remain zero-sum to `0.00`.

### Task 4: Connect Friends and Settle Up screens

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/store.tsx`
- Modify: `frontend/src/pages/Friends.tsx`
- Modify: `frontend/src/pages/SettleUp.tsx`
- Modify: `frontend/test/`

**Interfaces:**
- Add frontend types for global preference, plan, transfer, allocation, and transfer history using decimal-string money.
- Add a global-netting switch in Friends & Trust. It defaults on, can be turned off by each account, and shows whether each active friend has left the preference enabled.
- Add preview, accept, report, confirm, reject, and cancel actions to Settle Up. Render only server-returned plans and allocation details; do no client-side settlement calculation.

- [x] **Step 1: Write failing frontend tests** for preference state and payment-plan state rendering, including a pending report, a confirmed transfer, and a rejected transfer.
- [x] **Step 2: Run the focused frontend tests.** Expected: global settlement types and UI states are absent.
- [x] **Step 3: Wire the screens to the RPC contract.** Require a new request UUID for each new write, preserve the same UUID for retries, refresh after successful mutations, and show actionable stale-plan and opt-out errors.
- [x] **Step 4: Re-run the focused tests.** Expected: all plan states and mutation outcomes render without mock financial data.

### Task 5: Verify integration and publish developer guidance

**Files:**
- Modify: `backend/supabase/tests/database_contract.test.sql`
- Modify: `docs/superpowers/specs/2026-10-23-global-friend-settlement-design.md`
- Create or update: `docs/` API integration guidance

- [x] **Step 1: Add database-contract assertions** for private schemas, invoker wrappers, required RLS, narrow execution grants, and preference defaults.
- [x] **Step 2: Run backend and frontend suites:** `npm test` and `npm run typecheck` in `backend/`; `npm test` and `npm run build` in `frontend/`; run `git diff --check`.
- [x] **Step 3: Document** request/response examples, default-on preference and confirmation behavior, migration order, and known limits. Do not apply migrations to the hosted project or publish the frontend as part of this plan.
- [x] **Step 4: Re-run all checks** and verify the approved three-friend example end to end in the database test harness.
