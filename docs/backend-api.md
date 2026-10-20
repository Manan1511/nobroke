# NoBroke API contract

The Data API exposes the `api` schema for application RPCs. Use the authenticated Supabase client and call these functions with `.schema('api').rpc(name, args)`. All `p_*` names are PostgREST RPC argument keys. UUIDs are strings, dates use `YYYY-MM-DD`, and every money value is a decimal string to avoid JavaScript floating-point rounding.

```ts
const { data, error } = await supabase.schema("api").rpc("create_expense", {
  p_group_id: groupId,
  p_title: "Groceries",
  p_total_amount: "100.00",
  p_split_mode: "EQUAL",
  p_paid_by: payerId,
  p_participants: participantIds,
  p_request_id: crypto.randomUUID(),
});

if (error) {
  // Map stable database codes to product copy; never render raw SQL details.
  if (error.message === "income_setup_required") showIncomeSetupPrompt();
  else if (error.message === "financial_integration_not_ready") showRetryLater();
  else showValidationError();
}
```

## Groups

| RPC | Arguments | Result |
| --- | --- | --- |
| `create_group` | `p_name` | `{ group_id }` |
| `rename_group` | `p_group_id`, `p_name` | `{ group_id }` |
| `transfer_group_ownership` | `p_group_id`, `p_new_owner_id` | `{ group_id }` |
| `create_group_invite` | `p_group_id` | Invite token and expiry; the token is shown once |
| `accept_group_invite` | `p_token` | `{ group_id }` |
| `revoke_group_invite` | `p_invite_id` | `{ invite_id, revoked }` |
| `remove_group_member` | `p_group_id`, `p_user_id` | `{ group_id, user_id, removed }` |
| `leave_group` | `p_group_id` | `{ group_id, left }` |
| `list_groups` | optional `p_after_id`, `p_limit` | `GroupSummary[]` |
| `get_group` | `p_group_id` | Group detail or `null` |
| `list_group_members` | `p_group_id`, optional `p_after_membership_id`, `p_limit` | `GroupMember[]` |

Limits are clamped to 1–100; default page size is 50. Membership read access is restricted to active group members. A group owner must transfer ownership before leaving. Removal or departure is blocked while Person 3 reports outstanding obligations or an active recurring-bill role.

Invite creation is owner-only. Tokens are random, stored as hashes, expire in seven days, and can be accepted once. Return the plaintext token from `create_group_invite` to the intended teammate; never log or persist it in client analytics.

## Private income setup

| RPC | Arguments | Result |
| --- | --- | --- |
| `set_private_income` | `p_monthly_income` (positive decimal) | `{ configured: true }` |
| `clear_private_income` | none | `{ configured: false, cleared: boolean }` |
| `get_private_income_status` | none | `{ configured: boolean }` |

Exact salary input is converted immediately to a private band and discarded. No API returns salary or band. Income-ratio expenses require at least three distinct active participants and a configured band for each participant. Shares are fixed at posting time.

## Expenses

| RPC | Arguments | Result |
| --- | --- | --- |
| `create_expense` | `p_group_id`, `p_title`, `p_total_amount`, `p_split_mode`, `p_paid_by`, `p_participants`, `p_request_id`, optional `p_exact_shares` | `{ expense_id }` |
| `get_expense` | `p_expense_id` | `Expense` or `null` |
| `list_expenses` | `p_group_id`, optional `p_after_id`, `p_limit` | `Expense[]` |
| `void_expense` | `p_expense_id`, `p_reason` | `{ expense_id, status: 'VOIDED' }` |
| `replace_expense` | `p_expense_id`, `p_reason`, then create-expense arguments | `{ expense_id, replaces_expense_id }` |

`p_split_mode` accepts `EQUAL`, `EXACT`, or `INCOME_RATIO`. Exact shares are JSON objects shaped as `[{"participant_id":"…","share_amount":"12.34"}]`. Amounts must be positive INR values with at most two fractional digits; the payer may be outside the participant list. Equal and income splits distribute leftover paise with deterministic largest-remainder rounding, UUID order breaking ties.

Generate a fresh UUID for `p_request_id` per new write and reuse it only for retries of the same payload. Identical retries return the original expense; a different payload under the same ID fails with `idempotency_conflict`. Posted expense rows and splits are immutable. Only the logger or group owner may void; void/replace is rejected if Person 3 reports settlement or payment-rule involvement. Corrections preserve the original record and reason.

## Recurring bills

| RPC | Arguments | Result |
| --- | --- | --- |
| `create_recurring_template` | `p_group_id`, `p_title`, `p_total_amount`, `p_split_mode`, `p_frequency`, `p_start_date`, `p_paid_by`, `p_participants`, optional `p_exact_shares` | `{ template_id }` |
| `update_recurring_template` | `p_template_id`, `p_title`, `p_total_amount`, `p_split_mode`, `p_frequency`, `p_paid_by`, `p_participants`, optional `p_exact_shares` | `{ template_id, effective_date, version_no }` |
| `pause_recurring_template` | `p_template_id` | pause result |
| `resume_recurring_template` | `p_template_id` | resume result |
| `list_recurring_templates` | `p_group_id`, optional `p_after_id`, `p_limit` | `RecurringTemplate[]` |
| `get_recurring_template` | `p_template_id` | `RecurringTemplate` or `null` |
| `list_recurring_billing_runs` | `p_template_id`, optional `p_after_run_id`, `p_limit` | `BillingRun[]` |

Frequencies are `WEEKLY`, `MONTHLY`, and `YEARLY`. Dates are interpreted in `Asia/Kolkata`; month-end and leap-day schedules retain their original anchor. Changes create versions for future billing dates. A failed occurrence does not advance the cursor, and failure details use a sanitized error code.

## Errors and boundary

SQL raises stable machine-readable codes such as `authentication_required`, `group_access_denied`, `income_setup_required`, `income_split_requires_three_participants`, `idempotency_conflict`, `expense_correction_forbidden`, `active_recurring_bills_block_departure`, and `financial_integration_not_ready`. Person 3 may add obligation-specific codes for blocked corrections and departures. Map the returned PostgREST error `message` to UI copy; don't display raw database details.

Person 3 owns obligation, settlement, payment-rule and cascade semantics. Expense create/void and membership departure call internal hooks synchronously. Until those functions exist and are granted to the restricted `nobroke_executor` role, those flows fail closed and roll back. Never grant browser roles access to the `private` schema or its hooks.
