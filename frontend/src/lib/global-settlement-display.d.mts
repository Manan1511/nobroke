export type GlobalSettlementAction = "report" | "confirm" | "reject" | "cancel"

export function effectiveGlobalNettingPreference(
  preference: { enabled?: boolean } | null | undefined,
): boolean

export function canAcceptGlobalSettlementPlan(
  plan: { created_by: string; can_accept: boolean; status: string; expires_at: string } | null | undefined,
  viewerId: string | null | undefined,
  now?: number,
): boolean

export function canCancelGlobalSettlementPlan(
  plan: { created_by: string; can_accept: boolean; status: string } | null | undefined,
  viewerId: string | null | undefined,
): boolean

export function canDeclineGlobalSettlementPlan(
  plan: { created_by: string; status: string; participants: Array<{ user_id: string }> } | null | undefined,
  viewerId: string | null | undefined,
): boolean

export function hasOpenGlobalSettlementPreview(
  plans: Array<{ status: string; expires_at: string }> | null | undefined,
  now?: number,
): boolean

export function visibleGlobalSettlementHistory<T extends { plan_status?: string }>(
  items: T[] | null | undefined,
): T[]

export function globalTransferDirection(
  transfer: { debtor_user_id: string; debtor_name: string; creditor_user_id: string; creditor_name: string } | null | undefined,
  viewerId: string | null | undefined,
): { perspective: "outgoing" | "incoming" | "other"; label: string }

export function globalTransferActions(
  transfer: { debtor_user_id: string; creditor_user_id: string; status: string } | null | undefined,
  viewerId: string | null | undefined,
  sourceFriendshipsActive?: boolean,
): GlobalSettlementAction[]
