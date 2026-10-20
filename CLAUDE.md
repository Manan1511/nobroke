# Project context for Claude Code

## What this is
NoBroke: a group expense-sharing and debt-clearing app (Splitwise-style, but debts can be
routed through mutual friends). Full spec: `docs/PRD.md`.

Features: multi-hop settlement through friends (limited by trust/credit limits),
pay-when-paid rules (auto-forward money when someone pays you; loops cleared immediately;
partial payments cascade proportionally), private income-based splits (min 3 people,
incomes bucketed into bands), and recurring bills (billed once per period).

## Team split (3 people)
- Person 1 (this repo): frontend only. Pages + components, mock data. NO backend, database,
  or real financial logic in the frontend.
- Person 2: PostgreSQL schema, migrations, RLS, API, groups/expenses, income splits, recurring billing.
- Person 3: obligations, trust limits, multi-hop settlement, pay-when-paid cycle detection and
  partial cascades in PostgreSQL, plus their API endpoints.
All core business logic lives in PostgreSQL (see PRD section 3), not in the frontend.

## Stack
React 19 + Vite + Tailwind CSS v4, plain JavaScript (JSX, no TypeScript).
shadcn/ui-compatible setup: `components.json`, `@/` alias -> `src/`, shadcn color tokens in `src/index.css`.
Icons: lucide-react. Toasts: sonner.

## Layout
- `src/App.jsx`: shell (sidebar, header, simple state-based page switching)
- `src/pages/`: Dashboard, Groups, Expenses, Balances, SettleUp, PayRules, Recurring, Friends, Profile
- `src/components/ui/`: basic placeholder components with the SAME names and exports as shadcn
- `src/components/shared.jsx`: PageHeader, UserAvatar, AvatarStack, StatusBadge, label()
- `src/lib/api.js`: mock API contract (canned responses); backend team replaces with fetch()
- `src/lib/store.jsx`: in-memory state for mock data
- `src/data/mock.js`: mock data shaped like the PRD tables

## Current goal
Replace placeholder components in `src/components/ui/` with real shadcn ones, one at a time:
`npx shadcn@latest add <name> --overwrite`
Do the placeholders first: dialog, alert-dialog, sheet, dropdown-menu, tabs, tooltip, accordion.
When swapping, keep pages working (shadcn Dialog/AlertDialog/Sheet/DropdownMenu/Tabs accept the same
props used here: open/onOpenChange, asChild triggers, value/onValueChange). Delete `src/lib/overlay.jsx`
once nothing imports it. Run `npm run build` after each swap to check nothing broke.

## Rules
- Keep money values as numbers formatted with `inr()` from `src/lib/utils.js`; no money math beyond display/form validation.
- User-facing copy: plain, sentence case, from the user's point of view.
- Don't add a backend or database to this repo.
