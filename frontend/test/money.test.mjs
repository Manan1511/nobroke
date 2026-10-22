import assert from "node:assert/strict"
import test from "node:test"
import { availableMoney, compareMoney, isPositiveMoney, parseMoney, subtractMoney } from "../src/lib/money.mjs"

test("money comparisons and reserved balances use exact paise", () => {
  assert.equal(subtractMoney("0.30", "0.10"), "0.20")
  assert.equal(availableMoney("0.30", "0.10"), "0.20")
  assert.equal(compareMoney("0.20", availableMoney("0.30", "0.10")), 0)
  assert.equal(isPositiveMoney("0.01"), true)
  assert.equal(isPositiveMoney("0.001"), false)
  assert.equal(parseMoney("1.005"), null)
})
