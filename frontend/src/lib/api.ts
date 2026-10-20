// MOCK API — the agreed contract between frontend and backend.
// Each function returns what the real endpoint should return.
// Person 2/3: replace the bodies with fetch() calls; the frontend shouldn't need other changes.
// No real money logic happens here — these are canned answers for the UI.

import type { Expense, Group, Obligation, SettlementType } from "@/types"

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

// GET /groups/:id/balances  -> each member's net position in the group + the fewest transfers that settle it.
// Mock only: equal / exact shares from the group's expenses (income splits are worked out privately on the
// server, so here they count as equal). The backend replaces this with the real numbers.
export interface GroupBalance { user_id: string; net: number }
export interface Transfer { from: string; to: string; amount: number }
export function groupBalances(group: Group, expenses: Expense[]): { balances: GroupBalance[]; transfers: Transfer[] } {
  const net: Record<string, number> = Object.fromEntries(group.members.map((m) => [m, 0]))
  for (const e of expenses.filter((x) => x.group_id === group.group_id)) {
    const people = (e.participants ?? group.members).filter((p) => p in net)
    if (!people.length) continue
    net[e.paid_by] = (net[e.paid_by] ?? 0) + e.total_amount
    for (const p of people) {
      const share = e.split_mode === "EXACT" && e.exact_shares?.[p] !== undefined ? Number(e.exact_shares[p]) : e.total_amount / people.length
      net[p] -= share
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100
  const balances = Object.entries(net).map(([user_id, v]) => ({ user_id, net: round(v) })).sort((a, b) => b.net - a.net)
  // Greedy: biggest debtor pays biggest creditor until everyone is square.
  const creditors = balances.filter((b) => b.net > 0.005).map((b) => ({ ...b }))
  const debtors = balances.filter((b) => b.net < -0.005).map((b) => ({ ...b, net: -b.net }))
  const transfers: Transfer[] = []
  while (creditors.length && debtors.length) {
    const c = creditors[0], d = debtors[0]
    const amount = round(Math.min(c.net, d.net))
    transfers.push({ from: d.user_id, to: c.user_id, amount })
    c.net -= amount; d.net -= amount
    if (c.net < 0.005) creditors.shift()
    if (d.net < 0.005) debtors.shift()
  }
  return { balances, transfers }
}
