import assert from "node:assert/strict"
import test from "node:test"
import { individualPaymentTargets, onePaymentTargetPerPeer } from "../src/lib/net-position.mjs"

test("net payment choices show one eligible underlying debt per person", () => {
  const obligations = [
    { obligation_id: "jv-small", creditor_id: "jv" },
    { obligation_id: "harsh", creditor_id: "harsh" },
    { obligation_id: "jv-best-z", creditor_id: "jv" },
    { obligation_id: "jv-best-a", creditor_id: "jv" },
  ]
  const availableByObligation = new Map([
    ["jv-small", "5.00"],
    ["harsh", "8.00"],
    ["jv-best-z", "12.50"],
    ["jv-best-a", "12.50"],
  ])

  assert.deepEqual(
    onePaymentTargetPerPeer(obligations, (item) => availableByObligation.get(item.obligation_id)),
    [obligations[3], obligations[1]],
  )
})

test("net payment choices omit peers whose available amount is zero or invalid", () => {
  const obligations = [
    { obligation_id: "zero", creditor_id: "jv" },
    { obligation_id: "invalid", creditor_id: "harsh" },
  ]

  assert.deepEqual(
    onePaymentTargetPerPeer(obligations, (item) => item.obligation_id === "zero" ? "0.00" : "bad"),
    [],
  )
})

test("individual payment choices include every open debt with unreserved balance", () => {
  const obligations = [
    { obligation_id: "jv-coffee", creditor_id: "jv", status: "OPEN" },
    { obligation_id: "jv-lunch", creditor_id: "jv", status: "PARTIAL" },
    { obligation_id: "harsh-rent", creditor_id: "harsh", status: "OPEN" },
    { obligation_id: "settled", creditor_id: "jv", status: "SETTLED" },
    { obligation_id: "reserved", creditor_id: "harsh", status: "OPEN" },
  ]
  const availableByObligation = new Map([
    ["jv-coffee", "25.00"],
    ["jv-lunch", "8.00"],
    ["harsh-rent", "50.00"],
    ["settled", "10.00"],
    ["reserved", "0.00"],
  ])

  assert.deepEqual(
    individualPaymentTargets(obligations, (item) => availableByObligation.get(item.obligation_id)),
    obligations.slice(0, 3),
  )
})
