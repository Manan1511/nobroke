import assert from "node:assert/strict"
import test from "node:test"
import { listAllPages } from "../src/lib/pagination.mjs"

test("collection pagination follows every UUID cursor", async () => {
  const calls = []
  const rows = await listAllPages(async (args) => {
    calls.push(args.p_after_id)
    if (args.p_after_id === null) return Array.from({ length: 100 }, (_, index) => ({ id: `id-${index + 1}` }))
    if (args.p_after_id === "id-100") return [{ id: "id-101" }]
    throw new Error("unexpected cursor")
  }, { p_group_id: "group" }, { idField: "id" })
  assert.equal(rows.length, 101)
  assert.deepEqual(calls, [null, "id-100"])
})

test("timestamp pagination carries both the timestamp and tie-break UUID", async () => {
  const calls = []
  const firstTimestamp = "2026-10-23T12:00:00+00:00"
  const secondTimestamp = "2026-10-22T12:00:00+00:00"
  const rows = await listAllPages(async (args) => {
    calls.push([args.p_after_created_at, args.p_after_id])
    if (args.p_after_created_at === null) {
      return Array.from({ length: 100 }, (_, index) => ({ id: `id-${index + 1}`, created_at: firstTimestamp }))
    }
    return [{ id: "id-101", created_at: secondTimestamp }]
  }, {}, { idField: "id", timestampField: "created_at", timestampArg: "p_after_created_at" })
  assert.equal(rows.length, 101)
  assert.deepEqual(calls, [[null, null], [firstTimestamp, "id-100"]])
})
