import { apiRpc } from "@/lib/supabase"
import type { GroupBalance, RoutePreview, RuleCyclePreview } from "@backend/api-contract"

export type RulePreview = RuleCyclePreview

export async function previewRoute(obligationId: string, amount: string): Promise<RoutePreview> {
  return apiRpc<RoutePreview>("preview_route", { p_obligation_id: obligationId, p_amount: amount })
}

export async function executeRoute(previewId: string) {
  return apiRpc<{ route_id: string; obligation_id: string; status: "ROUTED"; amount: string; path: string[] }>(
    "execute_route", { p_preview_id: previewId },
  )
}

export async function previewRule(triggerId: string, targetId: string, amount: string): Promise<RulePreview> {
  return apiRpc<RulePreview>("preview_pay_when_paid_rule", {
    p_trigger_obligation_id: triggerId,
    p_target_obligation_id: targetId,
    p_max_amount: amount,
  })
}

export async function groupBalances(groupId: string): Promise<GroupBalance[]> {
  return (await apiRpc<GroupBalance[]>("get_group_balances", { p_group_id: groupId })) ?? []
}

export function newRequestId() {
  return crypto.randomUUID()
}
