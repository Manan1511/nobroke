# Person 3 database integration

Person 2 owns the migrations, API wrappers, expense ledger, group membership checks, and recurring scheduler. Person 3 owns obligation rows, trust consent and limits, routed balances, settlement and payment-rule participation, cycle detection, partial cascades, and the three internal hooks below.

```sql
private.post_expense_obligations(expense_id uuid) returns void
private.void_expense_obligations(expense_id uuid) returns void
private.assert_member_can_leave(group_id uuid, user_id uuid) returns void
```

Hooks execute synchronously inside the caller transaction. Raise an exception to abort the whole transaction. `post_expense_obligations` must create the resulting obligations from the immutable expense split rows. `void_expense_obligations` must reject if any settlement or payment rule makes the expense non-voidable, then reverse or preserve lineage according to Person 3's ledger rules. `assert_member_can_leave` must reject while the member has any group-linked debt, receivable, or routed/cascaded obligation that remains active.

The `nobroke_executor` role is `NOLOGIN`, `NOBYPASSRLS`, and has narrowly scoped grants. Keep hooks in the unexposed `private` schema, use fixed `search_path` values on privileged functions, revoke `PUBLIC`/`anon`/`authenticated` execution, then grant execution only to `nobroke_executor`. Do not grant `service_role` or a browser role access to the hooks.

Acquire locks in this order to avoid races with group membership and recurring generation: group row, expense or recurring template row, then Person 3 obligation/settlement rows. Expense functions lock the group before validating membership. The recurring worker also locks the group before the template. Person 3 hooks should preserve expense and group lineage so void and departure guards remain accurate after routing.

For isolated tests, `test/database.test.mjs` defines hook doubles only inside the PGlite test database. There are no production hook stubs in migrations. Apply Person 3's real migration before enabling expense posting or hosted Cron execution; until then operations fail closed.
