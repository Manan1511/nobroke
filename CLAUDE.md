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
Icons: lucide-react. Toasts: sonner. Routing: react-router v7. Landing: three 0.180 + gsap 3.13. Smooth scroll: lenis.

## Layout
- Routes (`src/main.jsx`): `/` = landing page, `/app` = dashboard, `/app/<slug>` = each section
  (groups, expenses, balances, settle-up, pay-when-paid, recurring-bills, friends, profile). Unknown -> `/`.
  When deploying (e.g. Vercel) add an SPA rewrite so every path serves index.html.
- `src/landing/`: the NoBroke landing hero from `Downloads/nobroke-source` (teammate's Vite + Three.js + GSAP page).
  `Landing.jsx` = its HTML as JSX (menu + buttons link into /app via data-app-link), `scene.js` = its main.js
  wrapped as mountLanding(root) with full cleanup, `landing.css` = its style.css scoped under `.nb-landing`.
  To pull a newer version of their page: re-port the same three files the same way.
- `src/lib/session.js`: demo sign-in kept in localStorage (`nobroke-session`: name + email, never a password).
  A first-time visitor counts as signed in (demo user "You"). Landing: signed in -> one ENTER button +
  "Signed in as <name>"; signed out -> LOG IN / SIGN UP (`src/landing/AuthPanel.jsx`, landing-styled form).
  `/app` redirects to `/` when signed out; Sign out in the account menu calls signOut(). Backend: replace
  signIn/signOut with real auth calls.
- `src/App.jsx`: app shell (shadcn Sidebar + header with Ctrl+K search, bell, dark-mode toggle, account menu
  with "home page" / sign out -> `/`); the page comes from the URL (`useParams` + `idForSlug`), go(id) navigates.
- `src/components/app-sidebar.jsx`: sidebar (collapses to icons, Ctrl+B; sheet on phones; counters on sections)
- `src/lib/smooth-scroll.js`: Lenis smooth scrolling (off for reduced motion; skips dialogs, menus, scroll areas, sidebar; pauses while Radix locks the page). Navigate with scrollToTop().
- `src/lib/nav.js`: the list of sections: slug (address), colour classes (--nav-* per section), icon animation;
  `pathFor(id)` / `idForSlug(slug)` (used by sidebar, page headers, search)
- `src/components/dashboard.jsx`: dashboard sections, layout modelled on TailAdmin (stat cards with trend,
  Spending over time area chart with 3M/6M/12M tabs, Settled-this-month ring, Who owes whom bars,
  Where the money went donut, Upcoming bills, Recent activity timeline)
- `src/components/notifications-menu.jsx`: header bell (unread count, mark all as read)
- `src/pages/`: Dashboard, Groups, Expenses (sortable data table),
  Balances, SettleUp, PayRules, Recurring, Friends, Profile
- `src/components/ui/`: official shadcn components (added with `npx shadcn@latest add`)
- `src/components/form-bits.jsx`: AmountInput (₹ input group), SplitModeToggle, DatePicker, PeoplePicker
  (combobox), SimpleSelect, PersonHover (hover card with balance + trust limit)
- `src/components/shared.jsx`: PageHeader (animated section icon), UserAvatar, AvatarStack, StatusBadge, label()
- `src/lib/api.js`: mock API contract (canned responses); backend team replaces with fetch()
- `src/lib/store.jsx`: in-memory state for mock data
- `src/data/mock.js`: mock data shaped like the PRD tables

## Theme
Matched to the landing page. Colours live in `src/index.css`: cream background #F2EEE6, ink #10100F as primary
(black pill buttons, like the landing's ACCESS APP), tube orange #FF4A1C as `brand` / ring / sidebar-primary,
warm card #FBF9F5. Meaning colours `positive` (owed to you), `negative` (you owe), `warning` (open), `info`
(in progress), each with a `-soft` tint. `--nav-<id>` = one colour per section icon. Charts: chart-1..3 =
orange / blue / gold, `--chart-positive/negative` for the balance chart (all colour-blind-checked).
Fonts: Inter (body, `font-sans`) and Anton (`font-display`: page titles, sidebar wordmark), loaded in index.html.
Buttons are pill-shaped (rounded-full in ui/button.jsx). Dark mode = `.dark` class on <html> (warm dark;
toggle in App.jsx, remembered in localStorage). The landing page keeps its own fixed cream look.

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
