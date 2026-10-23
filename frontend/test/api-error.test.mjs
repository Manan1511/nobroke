import assert from "node:assert/strict"
import test from "node:test"

let normalizeApiError
try {
  ({ normalizeApiError } = await import("../src/lib/api-error.mjs"))
} catch {
  normalizeApiError = undefined
}

test("a missing PostgREST RPC is distinct from an ordinary request failure", () => {
  assert.equal(typeof normalizeApiError, "function", "API error classification should exist")
  assert.equal(normalizeApiError("PGRST202", "Could not find the function api.preview_global_settlement in the schema cache"), "api_function_unavailable")
  assert.equal(normalizeApiError("PGRST202", "A transient unrelated error"), "request_failed")
  assert.equal(normalizeApiError("401", "Unauthorized"), "authentication_required")
})
