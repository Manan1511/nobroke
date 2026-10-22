import type { Database } from "./database.types.js";

/** Stable JSON shapes returned by NoBroke's api-schema RPCs. Money stays text. */
export type UUID = string;
export type Money = string;
/** EXACT shares are a JSON object keyed by participant UUID. */
export type ExactShares = Record<UUID, Money>;
export type ApiFunctionName = keyof Database["api"]["Functions"];
type ContractArgs<Args> = "p_exact_shares" extends keyof Args
  ? Omit<Args, "p_exact_shares"> & { p_exact_shares?: ExactShares | null }
  : Args;
export type ApiFunctionArgs<Name extends ApiFunctionName> =
  ContractArgs<Database["api"]["Functions"][Name]["Args"]>;

export type ExpenseSplitMode = "EQUAL" | "EXACT" | "INCOME_RATIO";
export type BillingFrequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface MyProfile {
  user_id: UUID;
  username: string;
  display_name: string;
}

export interface NotificationPreferences {
  reminders: boolean;
  cascades: boolean;
  recurring: boolean;
  social: boolean;
}

export type NotificationCategory = "REMINDERS" | "CASCADES" | "RECURRING" | "SOCIAL";

export interface AppNotification {
  notification_id: UUID;
  category: NotificationCategory;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface SpendingMonth {
  month: string;
  your_share: Money;
  you_paid: Money;
  group_total: Money;
}

export interface DashboardSummary {
  group_count: number;
  owe_total: Money;
  owed_total: Money;
  net_balance: Money;
  open_payable_count: number;
  open_receivable_count: number;
  current_month_spend: Money;
  current_month_paid: Money;
  current_month_group_total: Money;
  current_month_settled: Money;
  current_month_settlement_count: number;
  current_month_clear_percent: number;
}

export interface DashboardBalance {
  user_id: UUID;
  username: string;
  display_name: string;
  /** Positive values are receivables from this user. */
  net_amount: Money;
}

export interface DashboardGroupSpending { group_id: UUID; group_name: string; amount: Money; total_amount: Money; share_percent: number }

export type FriendshipStatus = "PENDING" | "ACTIVE" | "DECLINED" | "BLOCKED";

export interface FriendshipView {
  friendship_id: UUID;
  friend_id: UUID;
  username: string;
  display_name: string;
  status: FriendshipStatus;
  requested_by: UUID;
  trust_limit_me_to_them: Money;
  trust_limit_them_to_me: Money;
  exposure_me_to_them: Money;
  exposure_them_to_me: Money;
}

export type ObligationStatus = "OPEN" | "PARTIAL" | "SETTLED" | "VOIDED";

export interface ObligationView {
  obligation_id: UUID;
  debtor_user_id: UUID;
  creditor_user_id: UUID;
  group_id: UUID;
  expense_id: UUID;
  expense_title: string;
  original_amount: Money;
  remaining_amount: Money;
  reserved_amount: Money;
  status: ObligationStatus;
  is_routed: boolean;
  created_at: string;
  counterparty_username: string;
  counterparty_name: string;
  group_name: string;
}

export type PaymentStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";

export interface PaymentReport {
  payment_id: UUID;
  obligation_id: UUID;
  debtor_user_id: UUID;
  creditor_user_id: UUID;
  amount: Money;
  status: PaymentStatus;
  reported_at: string;
  resolved_at: string | null;
  debtor_name: string;
  creditor_name: string;
  task_id?: UUID | null;
}

export interface PayWhenPaidRule {
  rule_id: UUID;
  trigger_obligation_id: UUID;
  target_obligation_id: UUID;
  max_budget: Money;
  remaining_budget: Money;
  status: "ARMED" | "CANCELLED" | "EXHAUSTED";
  created_at: string;
  trigger_title: string;
  target_title: string;
  trigger_counterparty_id: UUID;
  target_counterparty_id: UUID;
}

export interface ForwardingTask {
  task_id: UUID;
  rule_id: UUID;
  trigger_payment_id: UUID;
  target_obligation_id: UUID;
  amount: Money;
  remaining_amount: Money;
  status: "PENDING" | "REPORTED" | "CONFIRMED" | "CANCELLED";
  expense_title: string;
  creditor_user_id: UUID;
  creditor_name: string;
  created_at: string;
}

export interface CycleNetBatch {
  cycle_net_id: UUID;
  amount: Money;
  created_at: string;
  rule_count: number;
  obligation_count: number;
}

export interface RoutePreview {
  preview_id: UUID;
  path: UUID[];
  amount: Money;
  expires_at: string;
}

export interface RuleCyclePreview {
  creates_cycle: boolean;
  cycle_net_amount: Money;
}

export interface GroupBalance {
  user_id: UUID;
  username: string;
  display_name: string;
  /** Positive means receivable; negative means payable. */
  net_amount: Money;
}

export interface SettlementHistoryItem {
  settlement_id: UUID;
  obligation_id: UUID;
  type: "EXTERNAL_PAYMENT" | "ROUTE" | "CYCLE_NET";
  amount: Money;
  from_user_id: UUID;
  to_user_id: UUID;
  created_at: string;
}

export interface GroupSummary {
  group_id: UUID;
  group_name: string;
  role: "OWNER" | "MEMBER";
  created_at: string;
}

export interface GroupMember {
  membership_id: UUID;
  user_id: UUID;
  username: string;
  display_name: string;
  role: "OWNER" | "MEMBER";
  joined_at: string;
  removed_at?: string | null;
  removed_by?: UUID | null;
}

export interface ExpenseSplit {
  participant_id: UUID;
  share_amount: Money;
}

export interface Expense {
  expense_id: UUID;
  group_id: UUID;
  title: string;
  total_amount: Money;
  currency: "INR";
  split_mode: ExpenseSplitMode;
  paid_by: UUID;
  created_by: UUID;
  status: "POSTED" | "VOIDED";
  replaces_expense_id: UUID | null;
  replaced_by_expense_id: UUID | null;
  correction_reason: string | null;
  created_at: string;
  splits: ExpenseSplit[];
}

export interface RecurringTemplate {
  template_id: UUID;
  group_id: UUID;
  created_by: UUID;
  paid_by: UUID;
  title: string;
  total_amount: Money;
  split_mode: ExpenseSplitMode;
  frequency: BillingFrequency;
  anchor_date?: string;
  next_run_date: string;
  is_active: boolean;
  last_success_at: string | null;
  last_success_date: string | null;
  backlog_count: number;
  failed_date: string | null;
  last_error_code: string | null;
  participants?: Array<{ user_id: UUID; fixed_share: Money | null }>;
}

export type BillingRun = {
  run_id: number;
  billing_cycle_date: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  expense_id: UUID | null;
  error_code: string | null;
  started_at: string;
  finished_at: string | null;
};

export type ApiErrorCode =
  | "authentication_required"
  | "group_access_denied"
  | "invalid_expense_amount"
  | "income_setup_required"
  | "income_split_requires_three_participants"
  | "idempotency_conflict"
  | "expense_correction_forbidden"
  | "active_recurring_bills_block_departure"
  | "financial_integration_not_ready"
  | "username_unavailable"
  | "invalid_profile"
  | "invalid_notification_preferences"
  | "debtor_required"
  | "creditor_required"
  | "payment_exceeds_unreserved_debt"
  | "payment_exceeds_task"
  | "payment_not_pending"
  | "route_unavailable_or_trust_insufficient"
  | "stale_route_preview"
  | "route_dependencies_active"
  | "trust_limit_below_used_exposure"
  | "active_friendship_required"
  | "rule_party_relationship_required"
  | "rule_obligations_must_be_open"
  | "forwarding_task_unavailable"
  | "group_member_has_open_obligations"
  | "reminder_cooldown_active"
  | (string & {});
