import assert from "node:assert/strict"
import test from "node:test"

const { authCallbackPath, inviteLoginHref, safePostLoginPath } = await import("../src/lib/auth-navigation.ts").catch(() => ({}))
const { resolveSelectedObligation } = await import("../src/lib/selection.ts").catch(() => ({}))

test("invite login keeps the one-use group token through sign-in", () => {
  assert.equal(inviteLoginHref("abc+/="), "/?auth=login&next=%2Finvite%2Fabc%252B%252F%253D")
})

test("post-login destination allows only NoBroke app and invite paths", () => {
  assert.equal(safePostLoginPath("/invite/abc"), "/invite/abc")
  assert.equal(safePostLoginPath("/app/groups?tab=members"), "/app/groups?tab=members")
  assert.equal(safePostLoginPath("https://attacker.example"), "/app")
  assert.equal(safePostLoginPath("//attacker.example"), "/app")
  assert.equal(safePostLoginPath("/auth/reset"), "/app")
  assert.equal(safePostLoginPath(null), "/app")
})

test("confirmation callback preserves an invite token through URL encoding", () => {
  const invitePath = new URLSearchParams(inviteLoginHref("abc+/=").split("?")[1]).get("next")
  const callback = authCallbackPath(invitePath)
  const next = new URLSearchParams(callback.split("?")[1]).get("next")

  assert.equal(callback, "/auth/callback?next=%2Finvite%2Fabc%252B%252F%253D")
  assert.equal(next, "/invite/abc%2B%2F%3D")
})

test("confirmation callback preserves app query and rejects unsafe destinations", () => {
  const appCallback = authCallbackPath("/app/groups?tab=members")
  assert.equal(new URLSearchParams(appCallback.split("?")[1]).get("next"), "/app/groups?tab=members")

  for (const destination of ["https://attacker.example", "//attacker.example", "/auth/reset", "/invite/"]) {
    const callback = authCallbackPath(destination)
    assert.equal(new URLSearchParams(callback.split("?")[1]).get("next"), "/app")
  }
})

test("settlement selection stays valid as open obligations refresh", () => {
  assert.equal(resolveSelectedObligation("", ["first", "second"]), "first")
  assert.equal(resolveSelectedObligation("second", ["first", "second"]), "second")
  assert.equal(resolveSelectedObligation("settled", ["first"]), "first")
  assert.equal(resolveSelectedObligation("first", []), "")
})
