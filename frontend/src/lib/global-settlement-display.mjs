/** Keep global-plan buttons aligned with server-owned roles and transfer states. */
export function effectiveGlobalNettingPreference(preference) {
  return preference?.enabled ?? true
}

export function canAcceptGlobalSettlementPlan(plan, viewerId, now = Date.now()) {
  return Boolean(plan?.can_accept)
    && plan?.created_by === viewerId
    && plan?.status === "PREVIEW"
    && Number.isFinite(Date.parse(plan?.expires_at ?? ""))
    && Date.parse(plan.expires_at) > now
}

export function canCancelGlobalSettlementPlan(plan, viewerId) {
  return Boolean(plan?.can_accept)
    && plan?.created_by === viewerId
    && plan?.status === "PREVIEW"
}

export function canDeclineGlobalSettlementPlan(plan, viewerId) {
  return Boolean(viewerId)
    && plan?.status === "PREVIEW"
    && plan?.created_by !== viewerId
    && Array.isArray(plan?.participants)
    && plan.participants.some((participant) => participant.user_id === viewerId)
}

export function hasOpenGlobalSettlementPreview(plans, now = Date.now()) {
  return Array.isArray(plans) && plans.some((plan) =>
    plan?.status === "PREVIEW"
      && Number.isFinite(Date.parse(plan?.expires_at ?? ""))
      && Date.parse(plan.expires_at) > now,
  )
}

export function visibleGlobalSettlementHistory(items) {
  return Array.isArray(items) ? items.filter((item) => item?.plan_status !== "CANCELLED") : []
}

export function globalTransferDirection(transfer, viewerId) {
  if (viewerId && transfer?.debtor_user_id === viewerId) {
    return { perspective: "outgoing", label: `You pay ${transfer.creditor_name}` }
  }
  if (viewerId && transfer?.creditor_user_id === viewerId) {
    return { perspective: "incoming", label: `${transfer.debtor_name} pays you` }
  }
  return { perspective: "other", label: `${transfer?.debtor_name ?? "Someone"} pays ${transfer?.creditor_name ?? "someone"}` }
}

export function globalTransferActions(transfer, viewerId, sourceFriendshipsActive = true) {
  if (!transfer || !viewerId) return []
  const isDebtor = transfer.debtor_user_id === viewerId
  const isCreditor = transfer.creditor_user_id === viewerId
  if (!sourceFriendshipsActive) {
    if (isDebtor && ["ACCEPTED", "PENDING"].includes(transfer.status)) return ["cancel"]
    if (isCreditor && transfer.status === "PENDING") return ["reject"]
    return []
  }
  if (isDebtor && transfer.status === "ACCEPTED") return ["report", "cancel"]
  if (isDebtor && transfer.status === "PENDING") return ["cancel"]
  if (isCreditor && transfer.status === "PENDING") return ["confirm", "reject"]
  return []
}
