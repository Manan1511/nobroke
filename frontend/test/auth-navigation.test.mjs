import assert from "node:assert/strict"
import test from "node:test"

const { inviteLoginHref, safePostLoginPath } = await import("../src/lib/auth-navigation.ts").catch(() => ({}))
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

test("settlement selection stays valid as open obligations refresh", () => {
  assert.equal(resolveSelectedObligation("", ["first", "second"]), "first")
  assert.equal(resolveSelectedObligation("second", ["first", "second"]), "second")
  assert.equal(resolveSelectedObligation("settled", ["first"]), "first")
  assert.equal(resolveSelectedObligation("first", []), "")
})
