export function getAddableGroupFriends<T extends { friend_id: string; status: string }>(
  friendships: T[],
  groupMemberIds: string[],
): T[]

export function canManageGroupFriendAdds(
  group: { owner_id?: string; members_can_invite_friends: boolean },
  currentUserId: string,
): boolean
