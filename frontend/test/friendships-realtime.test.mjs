import assert from "node:assert/strict"
import test from "node:test"
import { subscribeToFriendshipChanges } from "../src/lib/friendships-realtime.mjs"

function createRealtimeClient() {
  const registrations = []
  const removed = []
  const channel = {
    on(type, filter, callback) {
      registrations.push({ type, filter, callback })
      return this
    },
    subscribe(onStatus) {
      onStatus("SUBSCRIBED")
      return this
    },
  }

  return {
    registrations,
    removed,
    client: {
      channel: (name) => {
        channel.name = name
        return channel
      },
      removeChannel: (value) => removed.push(value),
    },
  }
}

test("friendship change subscription refreshes on reconnect and participant updates", () => {
  const { client, registrations } = createRealtimeClient()
  let refreshes = 0

  subscribeToFriendshipChanges(client, "current-user", () => { refreshes += 1 })

  assert.equal(refreshes, 1, "reconnect subscription refreshes missed changes")
  assert.equal(registrations.length, 2, "both friendship participant columns are watched")
  assert.deepEqual(registrations.map(({ type, filter }) => ({ type, ...filter })), [
    { type: "postgres_changes", event: "*", schema: "app", table: "friendships", filter: "user_a=eq.current-user", select: ["friendship_id", "user_a", "user_b", "status", "requested_by"] },
    { type: "postgres_changes", event: "*", schema: "app", table: "friendships", filter: "user_b=eq.current-user", select: ["friendship_id", "user_a", "user_b", "status", "requested_by"] },
  ])

  registrations[0].callback({ new: { status: "ACTIVE" } })
  assert.equal(refreshes, 2, "acceptance event refreshes the friend list")
})

test("friendship change subscription removes its channel when disposed", () => {
  const { client, removed } = createRealtimeClient()
  const dispose = subscribeToFriendshipChanges(client, "current-user", () => {})

  dispose()

  assert.equal(removed.length, 1)
})
