# Person 3 database integration

Person 2 owns migration integration, API wrappers, expense ledger, group membership checks, and recurring scheduler. Person 3 owns obligation rows, trust consent and limits, routed balances, settlement and payment-rule participation, cycle detection, partial cascades, and the three internal hooks below. The real hooks are installed by migrations `20261022221637` and `20261022221643`.

```sql
private.post_expense_obligations(expense_id uuid) returns void
private.void_expense_obligations(expense_id uuid) returns void
private.assert_member_can_leave(group_id uuid, user_id uuid) returns void
```

Hooks execute synchronously inside the caller transaction. Raise an exception to abort the whole transaction. `post_expense_obligations` must create the resulting obligations from the immutable expense split rows. `void_expense_obligations` must reject if any settlement or payment rule makes the expense non-voidable, then reverse or preserve lineage according to Person 3's ledger rules. `assert_member_can_leave` must reject while the member has any group-linked debt, receivable, or routed/cascaded obligation that remains active.

The `nobroke_executor` role is `NOLOGIN`, `NOBYPASSRLS`, and has narrowly scoped grants. Keep hooks in the unexposed `private` schema, use fixed `search_path` values on privileged functions, revoke `PUBLIC`/`anon`/`authenticated` execution, then grant execution only to `nobroke_executor`. Do not grant `service_role` or a browser role access to the hooks.

Acquire `private.lock_financial_writes()` before any business row lock. Then lock group rows in UUID order, expense or recurring-template rows, and obligation rows in UUID order. Expense functions lock the group before validating membership. The recurring worker uses the same global lock before locking the group and template. Hooks reuse the caller's transaction and locks; do not reverse this order. Preserve expense and group lineage through routing, settlement, and partial cascades so void and departure guards remain accurate.

For isolated tests, `test/database.test.mjs` defines hook doubles only inside the PGlite test database. Hosted migrations use the real hooks; there are no hosted test doubles. Expense posting, correction, departure, payment confirmation, routes, rules, tasks, and cycle netting have PGlite coverage. Keep hosted Cron unscheduled until team-account Auth, expense/correction, and recurring-billing smoke tests pass and a committed worker run is observed.
