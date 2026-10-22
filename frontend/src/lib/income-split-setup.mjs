export function isIncomeSplitLocallyBlocked(mode, participantIds, userId, configured) {
  return mode === "INCOME_RATIO"
    && (participantIds.length < 3 || (participantIds.includes(userId) && !configured))
}
