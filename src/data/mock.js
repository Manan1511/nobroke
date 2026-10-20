// Mock data shaped like the PRD tables. Person 2/3's API should return these same shapes.
export const CURRENT_USER_ID = "u1"

export const users = [
  { user_id: "u1", username: "you", name: "You", email: "you@example.com" },
  { user_id: "u2", username: "aarav", name: "Aarav Shah", email: "aarav@example.com" },
  { user_id: "u3", username: "diya", name: "Diya Nair", email: "diya@example.com" },
  { user_id: "u4", username: "kabir", name: "Kabir Rao", email: "kabir@example.com" },
  { user_id: "u5", username: "meera", name: "Meera Iyer", email: "meera@example.com" },
  { user_id: "u6", username: "rohan", name: "Rohan Das", email: "rohan@example.com" },
  { user_id: "u7", username: "neha", name: "Neha Gupta", email: "neha@example.com" },
]

// Friendships from the current user's point of view (API flattens user_a / user_b for us)
export const friendships = [
  { friendship_id: "f1", friend_id: "u2", status: "ACTIVE", credit_limit_me_to_them: 2000, credit_limit_them_to_me: 2000, exposure_me_to_them: 500, exposure_them_to_me: 0 },
  { friendship_id: "f2", friend_id: "u3", status: "ACTIVE", credit_limit_me_to_them: 3000, credit_limit_them_to_me: 1500, exposure_me_to_them: 0, exposure_them_to_me: 1200 },
  { friendship_id: "f3", friend_id: "u5", status: "ACTIVE", credit_limit_me_to_them: 1000, credit_limit_them_to_me: 1000, exposure_me_to_them: 0, exposure_them_to_me: 0 },
  { friendship_id: "f4", friend_id: "u4", status: "PENDING", credit_limit_me_to_them: 2000, credit_limit_them_to_me: 2000, exposure_me_to_them: 0, exposure_them_to_me: 0 },
]

export const groups = [
  { group_id: "g1", group_name: "Flat 4B", created_by: "u1", members: ["u1", "u2", "u3"] },
  { group_id: "g2", group_name: "Goa trip", created_by: "u2", members: ["u1", "u2", "u4", "u5", "u6", "u7"] },
  { group_id: "g3", group_name: "Lab lunch", created_by: "u3", members: ["u1", "u3", "u5"] },
]

export const expenses = [
  { expense_id: "e1", group_id: "g1", paid_by: "u1", title: "Groceries", total_amount: 1800, split_mode: "EQUAL", created_at: "2026-10-18" },
  { expense_id: "e2", group_id: "g2", paid_by: "u6", title: "Beach shack dinner", total_amount: 4800, split_mode: "EQUAL", created_at: "2026-10-12" },
  { expense_id: "e3", group_id: "g1", paid_by: "u2", title: "October rent", total_amount: 30000, split_mode: "INCOME_RATIO", created_at: "2026-10-01", recurring_template_id: "t1" },
  { expense_id: "e4", group_id: "g3", paid_by: "u3", title: "Canteen thali", total_amount: 450, split_mode: "EXACT", created_at: "2026-10-15" },
]

export const obligations = [
  { obligation_id: "o1", debtor_id: "u1", creditor_id: "u6", original_amount: 800, remaining_amount: 800, status: "OPEN", source: "Beach shack dinner" },
  { obligation_id: "o2", debtor_id: "u2", creditor_id: "u1", original_amount: 1200, remaining_amount: 700, status: "PARTIAL", source: "Groceries" },
  { obligation_id: "o3", debtor_id: "u1", creditor_id: "u3", original_amount: 450, remaining_amount: 450, status: "OPEN", source: "Canteen thali" },
  { obligation_id: "o4", debtor_id: "u5", creditor_id: "u1", original_amount: 600, remaining_amount: 600, status: "OPEN", source: "Cab to airport" },
  { obligation_id: "o5", debtor_id: "u1", creditor_id: "u4", original_amount: 300, remaining_amount: 0, status: "SETTLED", source: "Snacks" },
  { obligation_id: "o6", debtor_id: "u1", creditor_id: "u7", original_amount: 900, remaining_amount: 900, status: "OPEN", source: "Scooter rental" },
]

export const payWhenPaidRules = [
  { rule_id: "r1", trigger_receivable_id: "o4", target_payable_id: "o3", max_cascade_amount: 450, status: "ARMED", created_at: "2026-10-16" },
  { rule_id: "r2", trigger_receivable_id: "o2", target_payable_id: "o5", max_cascade_amount: 300, status: "TRIGGERED", created_at: "2026-10-05" },
]

export const recurringTemplates = [
  { template_id: "t1", group_id: "g1", paid_by: "u2", title: "Rent", total_amount: 30000, split_mode: "INCOME_RATIO", frequency: "MONTHLY", next_run_date: "2026-11-01", is_active: true, participants: ["u1", "u2", "u3"] },
  { template_id: "t2", group_id: "g1", paid_by: "u1", title: "Wi-Fi", total_amount: 999, split_mode: "EQUAL", frequency: "MONTHLY", next_run_date: "2026-11-05", is_active: true, participants: ["u1", "u2", "u3"] },
  { template_id: "t3", group_id: "g3", paid_by: "u5", title: "Netflix", total_amount: 649, split_mode: "EQUAL", frequency: "MONTHLY", next_run_date: "2026-11-10", is_active: false, participants: ["u1", "u3", "u5"] },
]

export const settlementBatches = [
  { batch_id: "b1", settlement_type: "MULTI_HOP", total_cleared: 500, executed_at: "2026-10-14", legs: [{ step_order: 1, from_user: "u1", to_user: "u2", amount: 500 }, { step_order: 2, from_user: "u2", to_user: "u6", amount: 500 }] },
  { batch_id: "b2", settlement_type: "DIRECT", total_cleared: 300, executed_at: "2026-10-10", legs: [{ step_order: 1, from_user: "u1", to_user: "u4", amount: 300 }] },
  { batch_id: "b3", settlement_type: "CASCADE_DOMINO", total_cleared: 300, executed_at: "2026-10-08", legs: [{ step_order: 1, from_user: "u2", to_user: "u1", amount: 300 }, { step_order: 2, from_user: "u1", to_user: "u4", amount: 300 }] },
  { batch_id: "b4", settlement_type: "CYCLE_CLEAR", total_cleared: 200, executed_at: "2026-10-02", legs: [{ step_order: 1, from_user: "u1", to_user: "u3", amount: 200 }, { step_order: 2, from_user: "u3", to_user: "u5", amount: 200 }, { step_order: 3, from_user: "u5", to_user: "u1", amount: 200 }] },
]

// Private: only the current user's own income band. Never other people's.
export const myPrivateFinancials = { monthly_income: 42000, equity_weight: 1.35, updated_at: "2026-09-30" }

// Dashboard: one row per month for the current user (the backend computes these).
// your_share = what your splits added up to; you_paid = what you paid for others; group_total = all spending in your groups.
export const spendingHistory = [
  { month: "2025-11", your_share: 11850, you_paid: 9200, group_total: 41200 },
  { month: "2025-12", your_share: 14320, you_paid: 16900, group_total: 52600 },
  { month: "2026-01", your_share: 12100, you_paid: 10400, group_total: 43900 },
  { month: "2026-02", your_share: 11480, you_paid: 12750, group_total: 40100 },
  { month: "2026-03", your_share: 12960, you_paid: 11300, group_total: 45800 },
  { month: "2026-04", your_share: 13540, you_paid: 15200, group_total: 47300 },
  { month: "2026-05", your_share: 15880, you_paid: 13900, group_total: 58400 },
  { month: "2026-06", your_share: 12230, you_paid: 12900, group_total: 44100 },
  { month: "2026-07", your_share: 11760, you_paid: 10100, group_total: 42700 },
  { month: "2026-08", your_share: 13190, you_paid: 14600, group_total: 46900 },
  { month: "2026-09", your_share: 12640, you_paid: 11800, group_total: 45200 },
  { month: "2026-10", your_share: 12780, you_paid: 13450, group_total: 46200 },
]

export const notifications = [
  { id: "n1", type: "REMINDER", text: "Rohan Das reminded you about Beach shack dinner", at: "2026-10-19T18:20:00", read: false },
  { id: "n2", type: "FRIEND_REQUEST", text: "Kabir Rao sent you a friend request", at: "2026-10-19T10:05:00", read: false },
  { id: "n3", type: "RULE_ARMED", text: "Your pay-when-paid rule for Canteen thali is waiting on Meera", at: "2026-10-16T13:40:00", read: false },
  { id: "n4", type: "SETTLED", text: "₹500 to Rohan was settled through Aarav", at: "2026-10-14T09:12:00", read: true },
  { id: "n5", type: "BILL", text: "Rent for November will be added on 1 Nov", at: "2026-10-12T08:00:00", read: true },
]
