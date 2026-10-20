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
- `src/App.jsx`: shell (shadcn Sidebar + header with Ctrl+K search, dark-mode toggle, account menu; state-based page switching)
- `src/components/app-sidebar.jsx`: sidebar (collapses to icons, Ctrl+B; sheet on phones; counters on sections)
- `src/lib/nav.js`: the list of sections + each icon's animation class (used by sidebar, page headers, search)
- `src/pages/`: Dashboard (stat cards, "Who owes whom" chart), Groups, Expenses (sortable data table),
  Balances, SettleUp, PayRules, Recurring, Friends, Profile
- `src/components/ui/`: official shadcn components (added with `npx shadcn@latest add`)
- `src/components/form-bits.jsx`: AmountInput (₹ input group), SplitModeToggle, DatePicker, PeoplePicker
  (combobox), SimpleSelect, PersonHover (hover card with balance + trust limit)
- `src/components/shared.jsx`: PageHeader (animated section icon), UserAvatar, AvatarStack, StatusBadge, label()
- `src/lib/api.js`: mock API contract (canned responses); backend team replaces with fetch()
- `src/lib/store.jsx`: in-memory state for mock data
- `src/data/mock.js`: mock data shaped like the PRD tables

## Theme
Colours live in `src/index.css`: teal-green primary, soft mint background, meaning colours
`positive` (owed to you), `negative` (you owe), `warning` (open), `info` (in progress), each with a `-soft`
tint; `--chart-positive/negative` are a colour-blind-checked pair for the balance chart. Dark mode = `.dark`
class on <html> (toggle in App.jsx, remembered in localStorage).

## Adding shadcn components (gotchas)
- `npx shadcn@latest add <name> --yes --overwrite` writes `import { cn } from "cn"` and installs an unrelated
  npm package `cn`. After every add: replace `from "cn"` with `from "@/lib/utils"` in src and `npm uninstall cn`.
- It also adds neutral `--sidebar-*` / colour vars to index.css: re-tint them to the NoBroke palette.
- Data Table uses `@tanstack/react-table` v8 (v9 has a different API).
- After installing packages, restart the dev server; delete `node_modules/.vite` if the browser shows
  "Invalid hook call" or 504 "Outdated Optimize Dep" (stale cache).

## Rules
- Keep money values as numbers formatted with `inr()` from `src/lib/utils.js`; no money math beyond display/form validation.
- User-facing copy: plain, sentence case, from the user's point of view.
- Don't add a backend or database to this repo.
- Run `npm run build` after changes to check nothing broke.
