import assert from "node:assert/strict"
import test from "node:test"
import { routeHistoryLegs } from "../src/lib/route-history.mjs"

test("route history keeps every destination from the full path", () => {
  assert.deepEqual(routeHistoryLegs(["A", "B", "C", "D"], "12.34"), [
    { step_order: 1, from_user: "A", to_user: "B", amount: "12.34" },
    { step_order: 2, from_user: "B", to_user: "C", amount: "12.34" },
    { step_order: 3, from_user: "C", to_user: "D", amount: "12.34" },
  ])
})

test("invalid route history paths produce no legs", () => {
  assert.deepEqual(routeHistoryLegs([], "1.00"), [])
  assert.deepEqual(routeHistoryLegs(["A"], "1.00"), [])
})
