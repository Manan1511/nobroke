// Display shapes populated from authenticated Supabase RPCs.

export type SplitMode = "EQUAL" | "EXACT" | "INCOME_RATIO"
export type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY"
export type ObligationStatus = "OPEN" | "PARTIAL" | "SETTLED" | "VOIDED"
export type RuleStatus = "ARMED" | "CANCELLED" | "EXHAUSTED"
export type FriendshipStatus = "ACTIVE" | "PENDING" | "BLOCKED" | "DECLINED" | "REMOVED"
export type SettlementType = "DIRECT" | "MULTI_HOP" | "CASCADE_DOMINO" | "CYCLE_CLEAR"
export type NotificationType = "REMINDER" | "FRIEND_REQUEST" | "RULE_ARMED" | "SETTLED" | "BILL"

export interface User { user_id: string; username: string; name: string; email?: string }

/** A friendship seen from the current user's side (the API flattens user_a / user_b). */
export interface Friendship {
  friendship_id: string
  friend_id: string
  status: FriendshipStatus
  requested_by?: string
  credit_limit_me_to_them: string
  credit_limit_them_to_me: string
  exposure_me_to_them: string
  exposure_them_to_me: string
  global_netting_enabled: boolean
}

export interface Group {
  group_id: string
  group_name: string
  created_by: string
  owner_id?: string
  members: string[]
  members_can_invite_friends: boolean
}

export interface Expense {
  expense_id: string
  group_id: string
  paid_by: string
  title: string
  total_amount: string
  split_mode: SplitMode
  created_at: string
  recurring_template_id?: string
  participants?: string[]
  exact_shares?: Record<string, string | number>
  note?: string
}

export interface Obligation {
  obligation_id: string
  debtor_id: string
  creditor_id: string
  original_amount: string
  remaining_amount: string
  cleared_percent?: number
  status: ObligationStatus
  source: string
  group_id?: string
  reserved_amount?: string
  is_routed?: boolean
}

export interface PayWhenPaidRule {
  rule_id: string
  trigger_receivable_id: string
  target_payable_id: string
  max_cascade_amount: string
  status: RuleStatus
  created_at: string
}

export interface RecurringTemplate {
  template_id: string
  group_id: string
  paid_by: string
  title: string
  total_amount: string
  split_mode: SplitMode
  frequency: Frequency
  next_run_date: string
  is_active: boolean
  participants: string[]
  fixed_shares?: Record<string, string | number>
  last_success_at?: string | null
  last_success_date?: string | null
  backlog_count?: number
  failed_date?: string | null
  last_error_code?: string | null
}

export interface SettlementLeg { step_order: number; from_user: string; to_user: string; amount: string }
export interface SettlementBatch { batch_id: string; settlement_type: SettlementType; total_cleared: string; executed_at: string; legs: SettlementLeg[] }

export interface PrivateFinancials { configured: boolean; updated_at?: string }
export interface SpendingMonth { month: string; your_share: string; you_paid: string; group_total: string }
export interface AppNotification { id: string; type: NotificationType; text: string; at: string; read: boolean }

export interface NotificationPreferences { reminders: boolean; cascades: boolean; recurring: boolean; social: boolean }
export interface DashboardSummary {
  group_count: number
  owe_total: string
  owed_total: string
  net_balance: string
  open_payable_count: number
  open_receivable_count: number
  current_month_spend: string
  current_month_paid: string
  current_month_group_total: string
  current_month_settled: string
  current_month_settlement_count: number
  current_month_clear_percent: number
}
export interface DashboardBalance { user_id: string; display_name: string; net_amount: string; available_to_pay: string }
export interface GroupSpending { group_id: string; group_name: string; amount: string; total_amount: string; share_percent: number }

export interface ForwardingTask {
  task_id: string; rule_id: string; trigger_payment_id: string; target_obligation_id: string
  amount: string; remaining_amount: string; status: "PENDING" | "REPORTED" | "CONFIRMED" | "CANCELLED"
  expense_title: string; creditor_user_id: string; creditor_name: string; created_at: string
}

export interface PaymentReport {
  payment_id: string; obligation_id: string; debtor_id: string; creditor_id: string
  amount: string; status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED"
  reported_at: string; task_id?: string | null
}

export interface StoreState {
  users: User[]
  friendships: Friendship[]
  groups: Group[]
  expenses: Expense[]
  obligations: Obligation[]
  rules: PayWhenPaidRule[]
  recurring: RecurringTemplate[]
  batches: SettlementBatch[]
  myFinancials: PrivateFinancials
  spending: SpendingMonth[]
  notifications: AppNotification[]
  forwardingTasks: ForwardingTask[]
  payments: PaymentReport[]
  notificationPreferences: NotificationPreferences
  dashboard: DashboardSummary
  globalNettingEnabled: boolean
  dashboardBalances: DashboardBalance[]
  groupSpending: GroupSpending[]
  loading: boolean
  loadError: string | null
}
