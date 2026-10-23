const friendshipColumns = ["friendship_id", "user_a", "user_b", "status", "requested_by"]

/** Subscribe only to rows involving the signed-in user. */
export function subscribeToFriendshipChanges(client, userId, onChange) {
  const subscribeToParticipantColumn = (column) => ({
    event: "*",
    schema: "app",
    table: "friendships",
    filter: `${column}=eq.${userId}`,
    select: friendshipColumns,
  })

  const channel = client
    .channel(`friendships:${userId}`)
    .on("postgres_changes", subscribeToParticipantColumn("user_a"), onChange)
    .on("postgres_changes", subscribeToParticipantColumn("user_b"), onChange)
    .subscribe((status) => {
      // Refresh after reconnect to cover changes that happened while offline.
      if (status === "SUBSCRIBED") onChange()
    })

  return () => { void client.removeChannel(channel) }
}
