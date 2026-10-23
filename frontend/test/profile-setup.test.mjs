import assert from "node:assert/strict"
import test from "node:test"

let profileSetup
try {
  profileSetup = await import("../src/lib/profile-setup.mjs")
} catch {
  profileSetup = undefined
}

test("unconfirmed fallback names stay generic and prompt for a preferred name", () => {
  assert.ok(profileSetup, "profile setup state module should exist")
  assert.deepEqual(profileSetup.getProfileNameState({
    display_name: "mananshah1511",
    name_setup_complete: false,
  }), {
    displayName: "You",
    needsName: true,
    setupComplete: false,
  })
})

test("confirmed preferred names are trimmed and shown without another prompt", () => {
  assert.ok(profileSetup, "profile setup state module should exist")
  assert.deepEqual(profileSetup.getProfileNameState({
    display_name: "  Ananya Rao  ",
    name_setup_complete: true,
  }), {
    displayName: "Ananya Rao",
    needsName: false,
    setupComplete: true,
  })
})
