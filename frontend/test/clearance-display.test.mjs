import assert from "node:assert/strict"
import test from "node:test"

let clearanceDisplay
try {
  ({ clearanceDisplay } = await import("../src/lib/clearance-display.mjs"))
} catch {
  clearanceDisplay = undefined
}

test("unpaid obligations show a clear empty state instead of an empty progress bar", () => {
  assert.equal(typeof clearanceDisplay, "function", "clearance display helper should exist")
  assert.deepEqual(clearanceDisplay(0), {
    hasProgress: false, percent: 0, label: "Nothing cleared yet",
  })
})

test("partly and fully cleared obligations show their progress", () => {
  assert.deepEqual(clearanceDisplay(38), {
    hasProgress: true, percent: 38, label: "38% cleared",
  })
  assert.deepEqual(clearanceDisplay(100), {
    hasProgress: true, percent: 100, label: "100% cleared",
  })
})
