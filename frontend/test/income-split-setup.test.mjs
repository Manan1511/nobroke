import assert from "node:assert/strict"
import test from "node:test"
import { isIncomeSplitLocallyBlocked } from "../src/lib/income-split-setup.mjs"

test("unconfigured logger outside income participants does not block a valid split", () => {
  assert.equal(isIncomeSplitLocallyBlocked("INCOME_RATIO", ["a", "b", "c"], "logger", false), false)
})

test("income split requires three people and own setup when the current user participates", () => {
  assert.equal(isIncomeSplitLocallyBlocked("INCOME_RATIO", ["a", "b"], "a", true), true)
  assert.equal(isIncomeSplitLocallyBlocked("INCOME_RATIO", ["a", "b", "c"], "a", false), true)
  assert.equal(isIncomeSplitLocallyBlocked("INCOME_RATIO", ["a", "b", "c"], "a", true), false)
  assert.equal(isIncomeSplitLocallyBlocked("EQUAL", ["a"], "a", false), false)
})
