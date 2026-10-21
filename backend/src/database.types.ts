// TypeScript API contract for the public and custom `api` schemas.
// Regenerate from the local Supabase stack with `npm run db:types`.
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
  accept_group_invite: Rpc<{ p_token: string }>;
  clear_private_income: Rpc<NoArgs>;
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
  list_expenses: Rpc<{ p_group_id: string; p_after_id?: string; p_limit?: number }>;
  list_group_members: Rpc<{
    p_group_id: string;
    p_after_membership_id?: string;
    p_limit?: number;
  }>;
  list_groups: Rpc<{ p_after_id?: string; p_limit?: number }>;
  list_recurring_billing_runs: Rpc<{
    p_template_id: string;
    p_after_run_id?: number;
    p_limit?: number;
  }>;
  list_recurring_templates: Rpc<{ p_group_id: string; p_after_id?: string; p_limit?: number }>;
  pause_recurring_template: Rpc<{ p_template_id: string }>;
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
