import assert from "node:assert/strict"
import test from "node:test"
import { canManageGroupFriendAdds, getAddableGroupFriends } from "../src/lib/group-membership.mjs"

test("only active friends who are not already group members are addable", () => {
  const friendships = [
    { friend_id: "member", status: "ACTIVE" },
    { friend_id: "active-friend", status: "ACTIVE" },
    { friend_id: "pending-friend", status: "PENDING" },
  ]

  assert.deepEqual(getAddableGroupFriends(friendships, ["member"]), [friendships[1]])
})

test("the group owner can add friends, while other members follow the group setting", () => {
  const disabled = { owner_id: "owner", members_can_invite_friends: false }
  const enabled = { ...disabled, members_can_invite_friends: true }

  assert.equal(canManageGroupFriendAdds(disabled, "owner"), true)
  assert.equal(canManageGroupFriendAdds(disabled, "member"), false)
  assert.equal(canManageGroupFriendAdds(enabled, "member"), true)
})
