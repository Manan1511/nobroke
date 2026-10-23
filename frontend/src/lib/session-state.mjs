export function sessionForAuthEvent(current, next) {
  if (!next) return null
  if (current?.userId !== next.userId) return next

  return { ...current, email: next.email }
}

export function sessionAfterProfileFailure(current, basic) {
  if (current?.userId === basic.userId && current.profileLoadState === "ready") return current
  return { ...basic, profileLoadState: "error" }
}

export function isLatestProfileRequest(requestId, latestRequestId, currentUserId, requestedUserId) {
  return requestId === latestRequestId && currentUserId === requestedUserId
}
