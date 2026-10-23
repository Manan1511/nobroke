import assert from "node:assert/strict"
import test from "node:test"
import { findRemindableReceivable } from "../src/lib/net-position.mjs"

test("reminder target is the largest available open receivable from that person", () => {
  const obligations = [
    { obligation_id: "owe", creditor_id: "me", debtor_id: "jv", status: "OPEN", remaining_amount: "200.00" },
    { obligation_id: "settled", creditor_id: "me", debtor_id: "jv", status: "SETTLED", remaining_amount: "500.00" },
    { obligation_id: "reserved", creditor_id: "me", debtor_id: "jv", status: "PARTIAL", remaining_amount: "450.00", reserved_amount: "450.00" },
    { obligation_id: "small", creditor_id: "me", debtor_id: "jv", status: "OPEN", remaining_amount: "30.00" },
    { obligation_id: "largest-available", creditor_id: "me", debtor_id: "jv", status: "PARTIAL", remaining_amount: "400.00", reserved_amount: "50.00" },
    { obligation_id: "other-person", creditor_id: "me", debtor_id: "harsh", status: "OPEN", remaining_amount: "999.00" },
  ]

  assert.equal(findRemindableReceivable(obligations, "me", "jv")?.obligation_id, "largest-available")
})

test("reminder target is absent without an available open receivable", () => {
  const obligations = [
    { obligation_id: "payable", creditor_id: "jv", debtor_id: "me", status: "OPEN", remaining_amount: "25.00" },
    { obligation_id: "reserved", creditor_id: "me", debtor_id: "jv", status: "OPEN", remaining_amount: "25.00", reserved_amount: "25.00" },
    { obligation_id: "void", creditor_id: "me", debtor_id: "jv", status: "VOIDED", remaining_amount: "25.00" },
  ]

  assert.equal(findRemindableReceivable(obligations, "me", "jv"), null)
})
