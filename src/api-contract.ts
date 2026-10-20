import type { Database } from "./database.types.js";

/** Stable JSON shapes returned by NoBroke's api-schema RPCs. Money stays text. */
export type UUID = string;
export type Money = string;
export type ApiFunctionName = keyof Database["api"]["Functions"];
export type ApiFunctionArgs<Name extends ApiFunctionName> =
  Database["api"]["Functions"][Name]["Args"];

export type ExpenseSplitMode = "EQUAL" | "EXACT" | "INCOME_RATIO";
export type BillingFrequency = "WEEKLY" | "MONTHLY" | "YEARLY";

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

export interface ExactShareInput {
  participant_id: UUID;
  share_amount: Money;
}

export type ApiErrorCode =
  | "authentication_required"
  | "group_access_denied"
  | "income_setup_required"
  | "income_split_requires_three_participants"
  | "idempotency_conflict"
  | "expense_correction_forbidden"
  | "active_recurring_bills_block_departure"
  | "financial_integration_not_ready"
  | (string & {});
