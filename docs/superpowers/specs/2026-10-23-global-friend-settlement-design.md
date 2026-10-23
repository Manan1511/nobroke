# Global friend settlement design

## Intent

People should be able to settle what they owe across all of their groups as one friend network. Groups continue to explain where each expense came from, but group boundaries do not restrict a global settlement plan. The app recommends the cash payments. It does not move money. A reported payment changes the ledger only after its recipient confirms receipt.

Example: the user owes Harsh ₹50, Harsh owes JV ₹25, and JV owes the user ₹25. If all three are active friends and have global netting enabled, the app recommends one external payment: the user pays Harsh ₹25. Netting is on by default, and each friend can turn it off. After Harsh confirms receipt, the app records the payment and nets the closed cycle so all three underlying obligations are settled. No one pays JV or the user separately.

## Goals

- Calculate settlement positions across every eligible open obligation, independent of source group.
- Use only active friend relationships. Global netting is enabled by default for each account, and anyone can opt out before a plan is created.
- Recommend deterministic, exact-paise transfers that conserve the value of the ledger.
- Preserve original expenses, group labels, and obligation lineage. Add immutable settlement records for external payments and non-cash netting.
- Require the recipient to confirm each real-world payment before applying the corresponding ledger changes.
- Keep previews and payment actions retry-safe, auditable, and safe against stale balances or concurrent changes.
- Keep private financial records and unrelated users' debts hidden from clients.

## Non-goals

- No in-app money movement or payment-provider integration.
- No implicit consent from accepting a friend request, setting a trust limit, or joining a group.
- No changes to ordinary group expense splits or recurring-bill calculations.
- Do not infer global-netting eligibility from pay-when-paid rules.

## Current behavior and constraints

The dashboard already aggregates a user's obligations by friend across groups. Debt routing can traverse obligations across groups, but it needs an active friendship and an explicit trust grant. Automatic cycle netting currently works only for armed pay-when-paid rules. Settle up therefore cannot currently turn a multi-person friend cycle into a single confirmed payment.

The ledger stores each obligation against its source group and expense. Confirmed payments, routes, and rule-based cycle netting have separate records. New global settlement records must preserve those distinctions and the source lineage. Financial writes use the shared advisory lock before row locks. Browser APIs use invoker wrappers while privileged database helpers remain private.

## Approaches considered

1. **Global settlement planner with default-on participation and opt-out, selected.** Calculate the eligible friend network across groups, produce a payment plan, and apply its external payment and internal netting allocations after recipient confirmation. Any friend can disable participation before a plan is created. This meets the example while preserving per-account control and the immutable ledger.
2. **Friendship alone authorizes netting.** This is simpler, but accepting a friend request would authorize changing debts across every group. It does not satisfy the selected consent boundary.
3. **Keep pairwise settlement and armed rules.** This reuses current operations, but it cannot reliably produce the requested one-payment recommendation unless each user manually creates rules.

## Proposed behavior

Add a global-netting preference in Friends & Trust. It defaults on for new and existing accounts that have no saved preference. A settlement component is eligible only when its members have active friendship links and every affected account still has global netting enabled. The preference is account-wide for active friends; users can turn it off at any time, which excludes them from new plans. Obligations involving a person outside the enabled friend component stay outside the plan.

Global netting does not require trust grants. Trust limits authorize new routed exposure; global netting only allocates and extinguishes existing debts when each affected account has left the default-on preference enabled. It must never create or increase an obligation.

The server builds a plan from open, unreserved obligations among eligible friends, across all groups. It excludes obligations with pending payment reports, forwarding tasks, armed pay-when-paid rules, or other active dependencies that would make the allocation ambiguous. The application is INR-only. All calculations use `NUMERIC(12,2)` and return decimal strings. The plan deterministically matches net debtors and creditors, then records the obligation-level allocations for each transfer. It guarantees conservation and the one-payment result in the example; it does not promise the mathematically smallest transfer count for every possible network. The plan is versioned against the obligations it uses. If a source obligation changes before acceptance, the server rejects it as stale and requires a fresh preview.

The plan shows the user only transfers they must make or receive, plus the debt details needed by affected participants to understand the proposed netting. It does not expose unrelated balances. In the example, the user sees one payment to Harsh for ₹25. The plan indicates that receipt confirmation will settle the linked ₹25 cycle while retaining the original expense and group history.

The user accepts the plan before paying outside NoBroke. Acceptance reserves its allocations so other payments, routes, rules, corrections, or departure actions cannot consume the same debt. The debtor reports each real payment against a plan transfer. Only that transfer's creditor can confirm or reject it. Each transfer is an independently balanced settlement package with its own obligation-level allocations. Confirmation applies that package's external-payment and global-netting allocations atomically. Active friendship links are checked again before reporting and confirming; if a link is blocked after a report, confirmation fails and the reservation remains until the debtor cancels, the creditor rejects, or the relationship is restored. A rejected or cancelled report releases its reservation. The payer can cancel an accepted transfer before reporting payment. Turning off global netting prevents new plans but does not break an accepted plan or erase an existing debt. Reported transfers remain reserved until the creditor confirms or rejects them, or the debtor cancels them. Confirmed packages are immutable. Replays return the original result; reuse of a request ID with changed plan data fails.

Expense voiding and replacement are blocked while any global transfer reserves an allocation from that expense. This prevents corrections from erasing debt that an accepted plan still needs to settle.

Add separate global settlement plan and allocation records rather than overloading pay-when-paid cycle IDs. Settlement history labels outside payments and global netting separately. All records retain source obligation, expense, group, parties, amount, and plan lineage. Ordinary balances remain visible until the relevant transfer is confirmed.

## Security and concurrency

- Read and write through authenticated `api` RPCs. Private helpers use fixed search paths, explicit authorization, narrow grants, and no browser execution.
- A participant can read only their own transfers and the related allocation details needed for their plan.
- Trust grants are not consulted because the plan cannot create or increase debt exposure.
- A single app-specific advisory lock is acquired before any row lock for plan creation, acceptance, report, resolution, cancellation, or preference changes.
- Lock groups, expenses, obligations, plans, and transfer reports in the existing global order, with UUID ordering where applicable.
- Revalidate preferences, friendship status, obligation versions, reservations, and plan expiry while accepting and confirming a plan.
- Do not log raw income, email, or full graph details.

## Acceptance criteria

- The three-person example yields one suggested payment of ₹25 from the user to Harsh, regardless of the groups containing the three obligations.
- The proposal is unavailable if any affected person has turned global netting off or is not an active friend.
- Previewing or accepting a plan does not reduce debt. Reporting a payment reserves it. Only recipient confirmation changes the ledger.
- A confirmed one-payment cycle clears the three ₹25 cycle portions and the corresponding ₹25 of the user's ₹50 debt to Harsh. The remaining unnetted amount is handled by the plan without losing original expense lineage.
- Duplicate reports and confirmations do not double-apply. Changed retries, stale previews, blocked friendships, pending reports, and competing routes fail safely.
- The total of all payment and netting allocations equals the total obligations reduced, and all money changes conserve value to ₹0.00.
- Existing pairwise payment, routing, rule, group-balance, privacy, and recurring-bill behavior continues to pass.

## Builder decisions

- Use a deterministic settlement matching strategy that guarantees conservation and returns the single transfer in the example. Document the transfer-count limit for large networks rather than promising globally minimal plans for every possible graph.
- Map each transfer to an independently balanced set of cash and non-cash allocations so confirmed legs can settle without waiting for unrelated legs.
- Generate database types only after the migration applies successfully. Keep hosted deployment and scheduler changes out of this implementation until acceptance tests pass.

## Implementation notes

- The initial implementation kept its migration local. A later authorized hosted rollout applied it as `backend/supabase/migrations/20261023184429_global_friend_settlement.sql`, followed by group-invite controls and a forward migration that restores the restricted executor JWT-subject helper for functions added after the original compatibility pass.
- A graph with no outside payment returns `global_settlement_no_payment_required` and leaves obligations unchanged. Without a recipient-confirmed payment, the current flow has no authorized confirmation event to trigger ledger netting.
- Plan reads are scoped to transfers the caller pays or receives, plus transfer packages whose source obligations include the caller.
