import { createClient } from "@supabase/supabase-js"
import type { Database } from "@backend/database.types"

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ""
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ""

export const isSupabaseConfigured = Boolean(url && publishableKey)

// The SDK owns its refreshable session storage. App data and financial values
// are always fetched from PostgreSQL and are never persisted in browser storage.
export const supabase = createClient<Database>(
  url || "https://not-configured.invalid",
  publishableKey || "not-configured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
)

const knownApiErrors = new Set([
  "authentication_required", "group_access_denied", "invalid_expense_amount",
  "income_setup_required", "income_split_requires_three_participants", "idempotency_conflict",
  "expense_correction_forbidden", "active_recurring_bills_block_departure",
  "financial_integration_not_ready", "username_unavailable", "invalid_profile",
  "invalid_notification_preferences", "debtor_required", "creditor_required",
  "payment_exceeds_unreserved_debt", "payment_exceeds_remaining_debt", "payment_exceeds_task",
  "payment_not_pending", "route_unavailable_or_trust_insufficient", "route_exceeds_unreserved_debt",
  "route_preview_not_found", "route_dependencies_active", "stale_route_preview",
  "trust_limit_below_used_exposure", "active_friendship_required", "rule_party_relationship_required",
  "rule_obligations_must_be_open", "forwarding_task_unavailable", "group_member_has_open_obligations",
  "group_member_has_routed_exposure", "reminder_cooldown_active", "friend_not_found",
  "friendship_response_forbidden", "friendship_not_found", "invalid_trust_limit",
  "invalid_payment_amount", "invalid_route_amount", "invalid_rule", "payment_exceeds_unreserved_debt",
])

export async function apiRpc<T = unknown>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isSupabaseConfigured) throw new Error("supabase_not_configured")
  const { data, error } = await supabase.schema("api").rpc(name as never, args as never)
  if (error) {
    const code = error.code === "P0001" && knownApiErrors.has(error.message)
      ? error.message
      : error.code === "PGRST301" || error.code === "401" ? "authentication_required" : "request_failed"
    throw new Error(code)
  }
  return data as T
}
