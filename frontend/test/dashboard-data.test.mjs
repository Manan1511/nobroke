import assert from "node:assert/strict"
import test from "node:test"

let dashboardData
try {
  dashboardData = await import("../src/lib/dashboard-data.mjs")
} catch {
  dashboardData = undefined
}

test("open dashboard balances exclude settled and voided obligations", () => {
  assert.ok(dashboardData, "dashboard balance filter module should exist")

  const obligations = [
    { obligation_id: "open", status: "OPEN" },
    { obligation_id: "partial", status: "PARTIAL" },
    { obligation_id: "settled", status: "SETTLED" },
    { obligation_id: "voided", status: "VOIDED" },
  ]

  assert.deepEqual(
    dashboardData.filterOpenObligations(obligations).map(({ obligation_id }) => obligation_id),
    ["open", "partial"],
  )
})
