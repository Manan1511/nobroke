// TypeScript API contract for the public and custom `api` schemas.
// Regenerate from the linked Supabase project with `npm run db:types`.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Rpc<Args> = { Args: Args; Returns: Json };
type NoArgs = Record<PropertyKey, never>;

type ApiFunctions = {
  add_group_friend: Rpc<{ p_group_id: string; p_friend_id: string }>;
  accept_global_settlement_plan: Rpc<{ p_plan_id: string }>;
  accept_group_invite: Rpc<{ p_token: string }>;
  block_friend: Rpc<{ p_friendship_id: string }>;
  remove_friend: Rpc<{ p_friendship_id: string }>;
  cancel_payment: Rpc<{ p_payment_id: string }>;
  cancel_global_settlement_plan: Rpc<{ p_plan_id: string }>;
  cancel_pay_when_paid_rule: Rpc<{ p_rule_id: string }>;
  clear_private_income: Rpc<NoArgs>;
  create_pay_when_paid_rule: Rpc<{
    p_trigger_obligation_id: string;
    p_target_obligation_id: string;
    p_max_amount: string;
    p_request_id: string;
  }>;
  confirm_payment: Rpc<{ p_payment_id: string }>;
  confirm_global_settlement_transfer: Rpc<{ p_transfer_id: string }>;
  check_username_availability: Rpc<{ p_username: string }>;
  get_dashboard_summary: Rpc<NoArgs>;
  get_dashboard_balances: Rpc<NoArgs>;
  get_dashboard_group_spending: Rpc<NoArgs>;
  get_global_netting_preference: Rpc<NoArgs>;
  get_global_settlement_plan: Rpc<{ p_plan_id: string }>;
  create_expense: Rpc<{
    p_group_id: string;
    p_title: string;
    p_total_amount: string;
    p_split_mode: string;
    p_paid_by: string;
    p_participants: string[];
    p_request_id: string;
    p_exact_shares?: Json;
  }>;
  create_group: Rpc<{ p_name: string }>;
  create_group_invite: Rpc<{ p_group_id: string }>;
  get_my_profile: Rpc<NoArgs>;
  get_group_balances: Rpc<{ p_group_id: string }>;
  get_notification_preferences: Rpc<NoArgs>;
  get_notification_unread_count: Rpc<NoArgs>;
  list_my_spending: Rpc<{ p_months?: number }>;
  list_notifications: Rpc<{
    p_after_created_at?: string;
    p_after_id?: string;
    p_limit?: number;
  }>;
  list_my_friends: Rpc<{ p_after_id?: string; p_limit?: number }>;
  list_global_settlement_plans: Rpc<{
    p_after_created_at?: string;
    p_after_plan_id?: string;
    p_limit?: number;
  }>;
  list_global_settlement_history: Rpc<{
    p_after_created_at?: string;
    p_after_transfer_id?: string;
    p_limit?: number;
  }>;
  list_my_obligations: Rpc<{ p_after_id?: string; p_limit?: number }>;
  list_my_pay_when_paid_rules: Rpc<{ p_after_id?: string; p_limit?: number }>;
  list_forwarding_tasks: Rpc<{ p_after_id?: string; p_limit?: number }>;
  list_cycle_net_batches: Rpc<{
    p_after_created_at?: string;
    p_after_id?: string;
    p_limit?: number;
  }>;
  list_payment_reports: Rpc<{
    p_after_created_at?: string;
    p_after_id?: string;
    p_limit?: number;
  }>;
  list_route_history: Rpc<{ p_after_created_at?: string; p_after_id?: string; p_limit?: number }>;
  list_settlement_history: Rpc<{
    p_after_created_at?: string;
    p_after_id?: string;
    p_limit?: number;
  }>;
  mark_all_notifications_read: Rpc<NoArgs>;
  mark_notification_read: Rpc<{ p_notification_id: string }>;
  create_recurring_template: Rpc<{
    p_group_id: string;
    p_title: string;
    p_total_amount: string;
    p_split_mode: string;
    p_frequency: string;
    p_start_date: string;
    p_paid_by: string;
    p_participants: string[];
    p_exact_shares?: Json;
  }>;
  get_expense: Rpc<{ p_expense_id: string }>;
  get_group: Rpc<{ p_group_id: string }>;
  get_private_income_status: Rpc<NoArgs>;
  get_recurring_template: Rpc<{ p_template_id: string }>;
  leave_group: Rpc<{ p_group_id: string }>;
  list_group_membership_history: Rpc<{ p_group_id: string; p_after_id?: string; p_limit?: number }>;
  list_expenses: Rpc<{ p_group_id: string; p_after_id?: string; p_limit?: number }>;
  list_group_members: Rpc<{
    p_group_id: string;
    p_after_membership_id?: string;
    p_limit?: number;
  }>;
  list_group_invites: Rpc<{ p_group_id: string }>;
  list_groups: Rpc<{ p_after_id?: string; p_limit?: number }>;
  list_recurring_billing_runs: Rpc<{
    p_template_id: string;
    p_after_run_id?: number;
    p_limit?: number;
  }>;
  list_recurring_templates: Rpc<{ p_group_id: string; p_after_id?: string; p_limit?: number }>;
  pause_recurring_template: Rpc<{ p_template_id: string }>;
  preview_route: Rpc<{ p_obligation_id: string; p_amount: string }>;
  preview_global_settlement: Rpc<{ p_request_id: string }>;
  preview_pay_when_paid_rule: Rpc<{
    p_trigger_obligation_id: string;
    p_target_obligation_id: string;
    p_max_amount: string;
  }>;
  execute_route: Rpc<{ p_preview_id: string }>;
  reject_payment: Rpc<{ p_payment_id: string }>;
  reject_global_settlement_transfer: Rpc<{ p_transfer_id: string }>;
  report_global_settlement_transfer: Rpc<{ p_transfer_id: string; p_request_id: string }>;
  remind_debtor: Rpc<{ p_obligation_id: string }>;
  report_payment: Rpc<{ p_obligation_id: string; p_amount: string; p_request_id: string }>;
  report_individual_payment: Rpc<{ p_obligation_id: string; p_amount: string; p_request_id: string }>;
  report_task_payment: Rpc<{ p_task_id: string; p_amount: string; p_request_id: string }>;
  request_friendship: Rpc<{ p_username: string }>;
  remove_group_member: Rpc<{ p_group_id: string; p_user_id: string }>;
  rename_group: Rpc<{ p_group_id: string; p_name: string }>;
  replace_expense: Rpc<{
    p_expense_id: string;
    p_reason: string;
    p_group_id: string;
    p_title: string;
    p_total_amount: string;
    p_split_mode: string;
    p_paid_by: string;
    p_participants: string[];
    p_request_id: string;
    p_exact_shares?: Json;
  }>;
  resume_recurring_template: Rpc<{ p_template_id: string }>;
  revoke_group_invite: Rpc<{ p_invite_id: string }>;
  set_private_income: Rpc<{ p_monthly_income: string }>;
  set_group_member_invites: Rpc<{ p_group_id: string; p_enabled: boolean }>;
  set_global_netting_preference: Rpc<{ p_enabled: boolean }>;
  set_trust_limit: Rpc<{ p_debtor_user_id: string; p_limit_amount: string }>;
  respond_friendship: Rpc<{ p_friendship_id: string; p_accept: boolean }>;
  cancel_global_settlement_transfer: Rpc<{ p_transfer_id: string }>;
  update_my_profile: Rpc<{ p_username: string; p_display_name: string }>;
  update_notification_preferences: Rpc<{ p_preferences: Json }>;
  transfer_group_ownership: Rpc<{ p_group_id: string; p_new_owner_id: string }>;
  update_recurring_template: Rpc<{
    p_template_id: string;
    p_title: string;
    p_total_amount: string;
    p_split_mode: string;
    p_frequency: string;
    p_paid_by: string;
    p_participants: string[];
    p_exact_shares?: Json;
  }>;
  void_expense: Rpc<{ p_expense_id: string; p_reason: string }>;
  void_expense_request: Rpc<{ p_expense_id: string; p_reason: string; p_request_id: string }>;
};

type EmptySchema = {
  Tables: Record<string, never>;
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: EmptySchema;
  api: Omit<EmptySchema, "Functions"> & { Functions: ApiFunctions };
};
