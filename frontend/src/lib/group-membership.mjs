export function getAddableGroupFriends(friendships, groupMemberIds) {
  const members = new Set(groupMemberIds)
  return friendships.filter((friendship) =>
    friendship.status === "ACTIVE" && !members.has(friendship.friend_id))
}

export function canManageGroupFriendAdds(group, currentUserId) {
  return group.owner_id === currentUserId || group.members_can_invite_friends === true
}
