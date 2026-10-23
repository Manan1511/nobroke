import assert from "node:assert/strict"
import test from "node:test"
import { subscribeToFinancialChanges } from "../src/lib/financial-realtime.mjs"

function createRealtimeClient() {
  const registrations = []
  const removed = []
  const channel = {
    on(type, filter, callback) {
      registrations.push({ type, filter, callback })
      return this
    },
    subscribe(onStatus) {
      this.onStatus = onStatus
      return this
    },
  }

  return {
    registrations,
    removed,
    channel,
    client: {
      channel: (name) => {
        channel.name = name
        return channel
      },
      removeChannel: (value) => removed.push(value),
    },
  }
}

test("financial changes refresh only the signed-in user's obligations and payments", async () => {
  const { client, registrations } = createRealtimeClient()
  let refreshes = 0

  const dispose = subscribeToFinancialChanges(client, "current-user", () => { refreshes += 1 })

  assert.equal(registrations.length, 4)
  assert.deepEqual(registrations.map(({ filter }) => [filter.schema, filter.table, filter.filter]), [
    ["app", "obligations", "debtor_user_id=eq.current-user"],
    ["app", "obligations", "creditor_user_id=eq.current-user"],
    ["app", "payment_reports", "debtor_user_id=eq.current-user"],
    ["app", "payment_reports", "creditor_user_id=eq.current-user"],
  ])

  registrations[0].callback({ new: { remaining_amount: "25.00" } })
  registrations[2].callback({ new: { status: "CONFIRMED" } })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(refreshes, 1, "one confirmation event refreshes aggregate balances once")
  dispose()
})

test("financial change subscription refreshes after reconnect and removes its channel", async () => {
  const { client, channel, removed } = createRealtimeClient()
  let refreshes = 0
  const dispose = subscribeToFinancialChanges(client, "current-user", () => { refreshes += 1 })

  channel.onStatus("SUBSCRIBED")
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(refreshes, 1)

  dispose()
  assert.equal(removed.length, 1)
})
