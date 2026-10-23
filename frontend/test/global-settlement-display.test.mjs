import assert from "node:assert/strict"
import test from "node:test"

let canAcceptGlobalSettlementPlan
let canCancelGlobalSettlementPlan
let canDeclineGlobalSettlementPlan
let hasOpenGlobalSettlementPreview
let globalTransferActions
let effectiveGlobalNettingPreference
let visibleGlobalSettlementHistory
try {
  ({ canAcceptGlobalSettlementPlan, canCancelGlobalSettlementPlan, canDeclineGlobalSettlementPlan,
    hasOpenGlobalSettlementPreview, globalTransferActions, effectiveGlobalNettingPreference,
    visibleGlobalSettlementHistory } = await import("../src/lib/global-settlement-display.mjs"))
} catch {
  canAcceptGlobalSettlementPlan = undefined
  canCancelGlobalSettlementPlan = undefined
  canDeclineGlobalSettlementPlan = undefined
  hasOpenGlobalSettlementPreview = undefined
  globalTransferActions = undefined
  effectiveGlobalNettingPreference = undefined
  visibleGlobalSettlementHistory = undefined
}

test("global netting is enabled by default and respects a saved opt-out", () => {
  assert.equal(typeof effectiveGlobalNettingPreference, "function", "global netting defaults should be explicit")
  assert.equal(effectiveGlobalNettingPreference(null), true)
  assert.equal(effectiveGlobalNettingPreference({ enabled: true }), true)
  assert.equal(effectiveGlobalNettingPreference({ enabled: false }), false)
})

test("only the creator can accept an unexpired preview plan", () => {
  assert.equal(typeof canAcceptGlobalSettlementPlan, "function", "global settlement plan action rules should exist")
  const now = Date.now()
  const plan = { created_by: "debtor", can_accept: true, status: "PREVIEW", expires_at: new Date(now + 60_000).toISOString() }
  assert.equal(canAcceptGlobalSettlementPlan(plan, "debtor", now), true)
  assert.equal(canAcceptGlobalSettlementPlan(plan, "creditor", now), false)
  assert.equal(canAcceptGlobalSettlementPlan({ ...plan, can_accept: false }, "debtor", now), false)
  assert.equal(canAcceptGlobalSettlementPlan({ ...plan, status: "ACCEPTED" }, "debtor", now), false)
  assert.equal(canAcceptGlobalSettlementPlan({ ...plan, expires_at: new Date(now).toISOString() }, "debtor", now), false)
})

test("preview plans can be cancelled by their creator or declined by an involved friend", () => {
  assert.equal(typeof canCancelGlobalSettlementPlan, "function", "creators need a way to discard their preview")
  assert.equal(typeof canDeclineGlobalSettlementPlan, "function", "involved friends need a way to decline a preview")
  const plan = {
    created_by: "creator", can_accept: true, status: "PREVIEW",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    participants: [{ user_id: "creator" }, { user_id: "friend" }],
  }
  assert.equal(canCancelGlobalSettlementPlan(plan, "creator"), true)
  assert.equal(canCancelGlobalSettlementPlan(plan, "friend"), false)
  assert.equal(canDeclineGlobalSettlementPlan(plan, "friend"), true)
  assert.equal(canDeclineGlobalSettlementPlan(plan, "creator"), false)
  assert.equal(canDeclineGlobalSettlementPlan(plan, "outsider"), false)
  assert.equal(canCancelGlobalSettlementPlan({ ...plan, status: "ACCEPTED" }, "creator"), false)
  assert.equal(canDeclineGlobalSettlementPlan({ ...plan, status: "CANCELLED" }, "friend"), false)
})

test("one active preview blocks another plan until it is accepted, declined, or expires", () => {
  assert.equal(typeof hasOpenGlobalSettlementPreview, "function", "duplicate previews must be prevented")
  const active = { status: "PREVIEW", expires_at: new Date(Date.now() + 60_000).toISOString() }
  assert.equal(hasOpenGlobalSettlementPreview([active]), true)
  assert.equal(hasOpenGlobalSettlementPreview([{ ...active, status: "CANCELLED" }]), false)
  assert.equal(hasOpenGlobalSettlementPreview([{ ...active, expires_at: new Date(Date.now() - 1).toISOString() }]), false)
  assert.equal(hasOpenGlobalSettlementPreview([]), false)
})

test("cancelled preview plans stay out of visible transfer history", () => {
  assert.equal(typeof visibleGlobalSettlementHistory, "function", "cancelled previews should not clutter settlement history")
  const activeTransfer = { transfer_id: "active", plan_status: "ACCEPTED", status: "CANCELLED" }
  const cancelledPreviewTransfer = { transfer_id: "preview", plan_status: "CANCELLED", status: "CANCELLED" }
  const pendingTransfer = { transfer_id: "pending", plan_status: "PREVIEW", status: "PLANNED" }
  assert.deepEqual(visibleGlobalSettlementHistory([activeTransfer, cancelledPreviewTransfer, pendingTransfer]), [activeTransfer, pendingTransfer])
  assert.deepEqual(visibleGlobalSettlementHistory(null), [])
})

test("global transfer controls follow debtor and creditor confirmation roles", () => {
  assert.equal(typeof globalTransferActions, "function", "global settlement transfer actions should exist")
  const transfer = { debtor_user_id: "debtor", creditor_user_id: "creditor", status: "ACCEPTED" }
  assert.deepEqual(globalTransferActions(transfer, "debtor"), ["report", "cancel"])
  assert.deepEqual(globalTransferActions({ ...transfer, status: "PENDING" }, "debtor"), ["cancel"])
  assert.deepEqual(globalTransferActions({ ...transfer, status: "PENDING" }, "creditor"), ["confirm", "reject"])
  assert.deepEqual(globalTransferActions({ ...transfer, status: "CONFIRMED" }, "creditor"), [])
  assert.deepEqual(globalTransferActions({ ...transfer, status: "REJECTED" }, "creditor"), [])
  assert.deepEqual(globalTransferActions(transfer, "unrelated"), [])
})

test("blocked source friendships remove report and confirm controls but retain release actions", () => {
  const transfer = { debtor_user_id: "debtor", creditor_user_id: "creditor", status: "ACCEPTED" }
  assert.deepEqual(globalTransferActions(transfer, "debtor", false), ["cancel"])
  assert.deepEqual(globalTransferActions({ ...transfer, status: "PENDING" }, "debtor", false), ["cancel"])
  assert.deepEqual(globalTransferActions({ ...transfer, status: "PENDING" }, "creditor", false), ["reject"])
})
