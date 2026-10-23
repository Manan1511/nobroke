import assert from "node:assert/strict"
import test from "node:test"

let netPosition
try {
  ({ netPosition } = await import("../src/lib/net-position.mjs"))
} catch {
  netPosition = undefined
}

test("net position follows the server balance direction and keeps paise exact", () => {
  assert.equal(typeof netPosition, "function", "net-position formatter should exist")

  assert.deepEqual(netPosition({ user_id: "jv", display_name: "JV", net_amount: "25.00" }), {
    user_id: "jv", display_name: "JV", direction: "OWES_YOU", amount: "25.00",
  })
  assert.deepEqual(netPosition({ user_id: "jv", display_name: "JV", net_amount: "-0.25" }), {
    user_id: "jv", display_name: "JV", direction: "YOU_OWE", amount: "0.25",
  })
  assert.deepEqual(netPosition({ user_id: "jv", display_name: "JV", net_amount: "0.00" }), {
    user_id: "jv", display_name: "JV", direction: "SQUARE", amount: "0.00",
  })
  assert.equal(netPosition({ user_id: "jv", display_name: "JV", net_amount: "invalid" }), null)
})
