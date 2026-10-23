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

test("username setup hides generated fallback handles and validates normalized choices", () => {
  assert.equal(typeof profileSetup.getUsernameSetupValue, "function")
  assert.equal(typeof profileSetup.normalizeUsername, "function")
  assert.equal(typeof profileSetup.isValidUsername, "function")

  assert.equal(profileSetup.getUsernameSetupValue("user-9b856375aedd4a36bd51b9ebae68e66d"), "")
  assert.equal(profileSetup.getUsernameSetupValue("  ananya_rao "), "ananya_rao")
  assert.equal(profileSetup.normalizeUsername("  Ananya.Rao_2 "), "ananya.rao_2")
  assert.equal(profileSetup.isValidUsername("ananya.rao_2"), true)
  assert.equal(profileSetup.isValidUsername("a"), false)
  assert.equal(profileSetup.isValidUsername("has space"), false)
})
