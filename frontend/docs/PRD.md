# PRD.md — Social Liquidity & Automated Expense Clearinghouse

> **Approved MVP contract:** this document's original sketches predate the Supabase implementation. Money stays in INR and the app is a debt ledger. People make payments outside NoBroke; debtor reports payment and creditor confirms receipt before debt changes. Routing reallocates debt without moving cash. Pay-when-paid rules create forwarding tasks, and each resulting payment needs separate receipt confirmation. Armed cycle netting clears ledger debt without cash. Trust defaults to ₹0.00 and increases only with explicit creditor consent. PostgreSQL owns all financial calculations and returns decimal strings. Exact salaries are discarded after conversion to private income bands.

## 1. Project Overview (Human Summary)

This software helps groups of people share costs and pay debts easily. Standard apps only track who owes money inside one single group. This system connects all your groups and friends so you can clear debts with fewer cash payments.

It does four main things:
* **Route debt through mutual friends:** The system finds an eligible path and reallocates obligations between consenting friends. This changes who owes whom in NoBroke; it does not make or record a cash payment.
* **Create pay-when-paid tasks:** You can link a receivable to a payable. After an outside payment is reported and the creditor confirms receipt, NoBroke may create a task for the next payment. The debtor makes that payment outside NoBroke, then the next creditor confirms receipt.
* **Divide bills by private income bands:** Income splits require at least three participants. PostgreSQL converts each positive monthly income to one private weight and discards the original amount. No API returns a salary or band.
* **Repeat regular bills automatically:** You can set up monthly bills like internet, rent, or streaming services one time. The system divides the cost and updates what everyone owes on the billing date each month.

---

## 2. Critical Architectural Flaws & Required Mitigations (Read Before Coding)

1. **The "Two-Person Algebra Leak" in Private Income Splits:**
   * *The Flaw:* If User A and User B split a ₹1,000 bill by income, and User A sees they owe ₹400 while User B owes ₹600, User A knows User B makes 1.5x their salary. Since User A knows their own exact income, they immediately know User B's exact salary. Privacy is broken.
   * *The Fix:* Income-proportional splits require **at least 3 participants**. PostgreSQL stores only one of four weights: `1.00` below ₹25,000; `1.35` from ₹25,000 to ₹49,999.99; `1.75` from ₹50,000 to ₹99,999.99; `2.25` from ₹1,00,000 upward. Shares use deterministic largest-remainder paise allocation; no randomized rounding is used.
2. **Unconsented Debt Shifting in Multi-Hop Routing:**
   * *The Flaw:* If User A owes Stranger D, and the system routes the debt through Friend B (A → B → D), Friend B is now stuck collecting money from User A instead of whatever balance they had before. If User A is slow to pay, Friend B gets burned without ever agreeing to the swap.
   * *The Fix:* Multi-hop routing can only traverse edges where users have explicitly set an active **Trust Credit Limit** (`credit_limit`), or where the hop *reduces* existing debt edges rather than creating new exposure.
3. **Circular Deadlocks & Partial Payments in "Pay-When-Paid":**
   * *The Flaw:* If User A waits for B to pay, B waits for C to pay, and C waits for A to pay, all three payments sit frozen forever. Also, if B owes A ₹1,000, and B only pays ₹500, does A's ₹1,000 queued payment to X fire partially or wait?
   * *The Fix:* Rule changes and relevant obligation changes trigger deterministic cycle detection. Consenting armed cycles net the minimum available debt amount without cash. Confirmed partial receipts may create bounded, reserved forwarding tasks; each downstream payment requires a separate report and creditor confirmation.

---

## 3. System Architecture & AI Context Instructions

> You are building a database-centric financial clearing application. **Do not** perform graph routing, balance aggregation, income-ratio calculations, or payment cascades in the application backend (Node.js/Python/Go). All core business logic, cycle detection, row locking, and privacy masking **must** execute inside PostgreSQL 16+ using SQL queries, Recursive CTEs, Triggers, Row-Level Security (RLS), and `PL/pgSQL` stored procedures.

### Tech Stack
* **Database Engine:** PostgreSQL 16+ (`WITH RECURSIVE`, `ROW LEVEL SECURITY`, `SECURITY DEFINER`, and `pg_cron` or scheduled job runners).
* **Concurrency Model:** Pessimistic row-level locking (`SELECT ... FOR UPDATE`) for settlement routing and cascade execution; `SERIALIZABLE` or `REPEATABLE READ` isolation for batch settlements.
* **Data Types:** Strictly use `NUMERIC(12, 2)` for all monetary values. **Never** use `FLOAT` or `REAL`.

### Core System Invariants
1. **Zero-Sum Conservation of Money:** Across any expense split, multi-hop settlement batch, or Pay-When-Paid cascade, the sum of all net balance changes must equal `0.00`.
2. **Strict Privacy Boundary:** `user_private_financials` must never be readable via standard `SELECT` by any application user. Only a `SECURITY DEFINER` stored procedure can read it to output computed expense splits.
3. **Idempotency:** Recurring charge runs and settlement batches must enforce unique idempotency keys (`template_id + billing_period_date`) so duplicate cron triggers never double-bill users.

---

## 4. Complete Database Schema (PostgreSQL DDL)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE user_private_financials (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    monthly_income NUMERIC(12, 2) NOT NULL CHECK (monthly_income > 0),
    equity_weight NUMERIC(5, 2) GENERATED ALWAYS AS (
        CASE
            WHEN monthly_income < 25000 THEN 1.00
            WHEN monthly_income < 50000 THEN 1.35
            WHEN monthly_income < 100000 THEN 1.75
            ELSE 2.25
        END
    ) STORED,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE user_private_financials ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_financials_self_only ON user_private_financials
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE TABLE friendships (
    friendship_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a UUID NOT NULL REFERENCES users(user_id),
    user_b UUID NOT NULL REFERENCES users(user_id),
    credit_limit_a_to_b NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (credit_limit_a_to_b >= 0),
    credit_limit_b_to_a NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (credit_limit_b_to_a >= 0),
    current_exposure_a_to_b NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    current_exposure_b_to_a NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'BLOCKED')),
    CONSTRAINT chk_canonical_order CHECK (user_a < user_b),
    CONSTRAINT uq_friendship_pair UNIQUE (user_a, user_b)
);

CREATE TABLE expense_groups (
    group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_name VARCHAR(100) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE group_members (
    group_id UUID NOT NULL REFERENCES expense_groups(group_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE recurring_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES expense_groups(group_id) ON DELETE CASCADE,
    paid_by UUID NOT NULL REFERENCES users(user_id),
    title VARCHAR(120) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
    split_mode VARCHAR(20) NOT NULL CHECK (split_mode IN ('EQUAL', 'EXACT', 'INCOME_RATIO')),
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('WEEKLY', 'MONTHLY', 'YEARLY')),
    next_run_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE recurring_participants (
    template_id UUID NOT NULL REFERENCES recurring_templates(template_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id),
    fixed_share NUMERIC(12, 2),
    PRIMARY KEY (template_id, user_id)
);

CREATE TABLE expenses (
    expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES expense_groups(group_id),
    paid_by UUID NOT NULL REFERENCES users(user_id),
    recurring_template_id UUID REFERENCES recurring_templates(template_id),
    billing_cycle_date DATE,
    title VARCHAR(120) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
    split_mode VARCHAR(20) NOT NULL CHECK (split_mode IN ('EQUAL', 'EXACT', 'INCOME_RATIO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_recurring_cycle UNIQUE (recurring_template_id, billing_cycle_date)
);

CREATE TABLE expense_splits (
    split_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(expense_id) ON DELETE CASCADE,
    debtor_id UUID NOT NULL REFERENCES users(user_id),
    owed_amount NUMERIC(12, 2) NOT NULL CHECK (owed_amount >= 0),
    UNIQUE (expense_id, debtor_id)
);

CREATE TABLE obligations (
    obligation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_expense_id UUID REFERENCES expenses(expense_id),
    debtor_id UUID NOT NULL REFERENCES users(user_id),
    creditor_id UUID NOT NULL REFERENCES users(user_id),
    original_amount NUMERIC(12, 2) NOT NULL CHECK (original_amount > 0),
    remaining_amount NUMERIC(12, 2) NOT NULL CHECK (remaining_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIAL', 'SETTLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_not_self_debt CHECK (debtor_id <> creditor_id)
);

CREATE TABLE pay_when_paid_rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    trigger_receivable_id UUID NOT NULL REFERENCES obligations(obligation_id),
    target_payable_id UUID NOT NULL REFERENCES obligations(obligation_id),
    max_cascade_amount NUMERIC(12, 2) NOT NULL CHECK (max_cascade_amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ARMED' CHECK (status IN ('ARMED', 'TRIGGERED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_different_obligations CHECK (trigger_receivable_id <> target_payable_id)
);

CREATE TABLE settlement_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settled_obligation_id UUID REFERENCES obligations(obligation_id),
    settlement_type VARCHAR(30) NOT NULL CHECK (settlement_type IN ('DIRECT', 'MULTI_HOP', 'CASCADE_DOMINO', 'CYCLE_CLEAR')),
    total_cleared NUMERIC(12, 2) NOT NULL CHECK (total_cleared > 0),
    executed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE settlement_legs (
    leg_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES settlement_batches(batch_id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    from_user UUID NOT NULL REFERENCES users(user_id),
    to_user UUID NOT NULL REFERENCES users(user_id),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    UNIQUE (batch_id, step_order)
);
```
