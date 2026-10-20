// MOCK API — the agreed contract between frontend and backend.
// Each function returns what the real endpoint should return.
// Person 2/3: replace the bodies with fetch() calls; the frontend shouldn't need other changes.
// No real money logic happens here — these are canned answers for the UI.

import type { Obligation, SettlementType } from "@/types"

export interface RouteResult { ok: boolean; type: SettlementType; path: string[]; amount: number; reason?: string }
export interface RulePreview { creates_loop: boolean; loop_amount: number }
export interface IncomeCheck { ok: boolean; reason?: string }

const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))

// GET /settlements/route?obligation_id=...
export async function findRoute(obligation: Obligation): Promise<RouteResult> {
  await wait()
  if (obligation.obligation_id === "o1") {
    return { ok: true, type: "MULTI_HOP", path: ["u1", "u2", "u6"], amount: obligation.remaining_amount }
  }
  if (obligation.obligation_id === "o6") {
    return { ok: false, type: "MULTI_HOP", path: ["u1", "u3", "u7"], amount: obligation.remaining_amount,
      reason: "Diya has already used ₹1,200 of the ₹1,500 trust limit she gave you, so this payment can't pass through her." }
  }
  return { ok: true, type: "DIRECT", path: [obligation.debtor_id, obligation.creditor_id], amount: obligation.remaining_amount }
}

// POST /pay-when-paid/preview  { trigger_receivable_id, target_payable_id }
export async function previewRule(triggerId: string, targetId: string): Promise<RulePreview> {
  await wait(300)
  return { creates_loop: triggerId === "o2" && targetId === "o1", loop_amount: 700 }
}

// POST /expenses/preview  (income splits are computed privately by the server)
export async function previewIncomeSplit(participantIds: string[]): Promise<IncomeCheck> {
  await wait(300)
  if (participantIds.length < 3) return { ok: false, reason: "Income splits need at least 3 people." }
  return { ok: true }
}

// GET /me/spending?months=12  -> [{ month: "YYYY-MM", your_share, you_paid, group_total }]
// GET /me/notifications       -> [{ id, type, text, at, read }]
// The UI currently reads both from the mock store (see src/data/mock.js for the shapes).
