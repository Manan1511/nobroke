// Shapes of the data the backend sends (they mirror the PRD tables; see src/data/mock.ts for examples).

export type SplitMode = "EQUAL" | "EXACT" | "INCOME_RATIO"
export type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY"
export type ObligationStatus = "OPEN" | "PARTIAL" | "SETTLED"
export type RuleStatus = "ARMED" | "TRIGGERED" | "CANCELLED"
export type FriendshipStatus = "ACTIVE" | "PENDING" | "BLOCKED"
export type SettlementType = "DIRECT" | "MULTI_HOP" | "CASCADE_DOMINO" | "CYCLE_CLEAR"
export type NotificationType = "REMINDER" | "FRIEND_REQUEST" | "RULE_ARMED" | "SETTLED" | "BILL"

export interface User { user_id: string; username: string; name: string; email: string }

/** A friendship seen from the current user's side (the API flattens user_a / user_b). */
export interface Friendship {
  friendship_id: string
  friend_id: string
  status: FriendshipStatus
  credit_limit_me_to_them: number
  credit_limit_them_to_me: number
  exposure_me_to_them: number
  exposure_them_to_me: number
}

export interface Group { group_id: string; group_name: string; created_by: string; members: string[] }

export interface Expense {
  expense_id: string
  group_id: string
  paid_by: string
  title: string
  total_amount: number
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
  original_amount: number
  remaining_amount: number
  status: ObligationStatus
  source: string
}

export interface PayWhenPaidRule {
  rule_id: string
  trigger_receivable_id: string
  target_payable_id: string
  max_cascade_amount: number
  status: RuleStatus
  created_at: string
}

export interface RecurringTemplate {
  template_id: string
  group_id: string
  paid_by: string
  title: string
  total_amount: number
  split_mode: SplitMode
  frequency: Frequency
  next_run_date: string
  is_active: boolean
  participants: string[]
  fixed_shares?: Record<string, string | number>
}

export interface SettlementLeg { step_order: number; from_user: string; to_user: string; amount: number }
export interface SettlementBatch { batch_id: string; settlement_type: SettlementType; total_cleared: number; executed_at: string; legs: SettlementLeg[] }

export interface PrivateFinancials { monthly_income: number; equity_weight: number; updated_at: string }
export interface SpendingMonth { month: string; your_share: number; you_paid: number; group_total: number }
export interface AppNotification { id: string; type: NotificationType; text: string; at: string; read: boolean }

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
}
