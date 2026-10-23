import assert from "node:assert/strict"
import test from "node:test"

let sessionState
try {
  sessionState = await import("../src/lib/session-state.mjs")
} catch {
  sessionState = undefined
}

test("same-user auth refresh preserves the hydrated profile", () => {
  assert.ok(sessionState, "session state module should exist")
  const current = {
    userId: "user-1", email: "old@example.test", name: "Ananya Rao", username: "ananya",
    nameSetupComplete: true, profileLoadState: "ready",
  }
  const next = { ...current, email: "new@example.test", name: "You", username: "", nameSetupComplete: false, profileLoadState: "loading" }

  assert.deepEqual(sessionState.sessionForAuthEvent(current, next), { ...current, email: "new@example.test" })
})

test("identity changes and sign-out replace the previous profile", () => {
  assert.ok(sessionState, "session state module should exist")
  const current = { userId: "user-1", name: "Ananya Rao", profileLoadState: "ready" }
  const next = { userId: "user-2", name: "You", profileLoadState: "loading" }

  assert.equal(sessionState.sessionForAuthEvent(current, next), next)
  assert.equal(sessionState.sessionForAuthEvent(current, null), null)
})

test("transient profile failures preserve a previously hydrated profile", () => {
  assert.ok(sessionState, "session state module should exist")
  const current = {
    userId: "user-1", email: "one@example.test", name: "Ananya Rao", username: "ananya",
    nameSetupComplete: true, profileLoadState: "ready",
  }
  const basic = { userId: "user-1", email: current.email, name: "You", username: "", nameSetupComplete: false, profileLoadState: "loading" }

  assert.equal(sessionState.sessionAfterProfileFailure(current, basic), current)
  assert.deepEqual(sessionState.sessionAfterProfileFailure(null, basic), { ...basic, profileLoadState: "error" })
})

test("only the latest profile request for the active user may publish", () => {
  assert.ok(sessionState, "session state module should exist")
  assert.equal(sessionState.isLatestProfileRequest(4, 4, "user-1", "user-1"), true)
  assert.equal(sessionState.isLatestProfileRequest(3, 4, "user-1", "user-1"), false)
  assert.equal(sessionState.isLatestProfileRequest(4, 4, "user-2", "user-1"), false)
})
