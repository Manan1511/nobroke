# NoBroke frontend context

NoBroke is a public-signup group expense and debt-ledger app. Email confirmation is required; groups and financial data remain protected by membership and database authorization. Preserve existing visual direction and routes while connecting screens to Supabase. Product behavior lives in [docs/PRD.md](docs/PRD.md); database boundary lives in `../backend/docs/backend-api.md`.

## Ownership and financial rules

- Person 1 owns React pages and components. Do not add backend, database, or financial business logic here.
- Person 2 owns Supabase Auth, groups, expenses, income bands, recurring billing, notifications, and shared contracts.
- Person 3 owns obligations, trust, debt routing, confirmed-payment settlements, pay-when-paid tasks, and cycle netting.
- PostgreSQL computes splits, balances, routes, reservations, cascades, and dashboard aggregates. Frontend displays server results.
- API money values are decimal strings. Never persist income, income bands, or financial app state in browser storage, logs, or analytics. Only Supabase SDK owns session persistence; theme preference may use local storage.
- Outside payment changes debt only after creditor confirms receipt. Debt routing reallocates ledger obligations and moves no cash. Pay-when-paid rules create forwarding tasks; each task requires a separate reported payment and receipt confirmation. Cycle netting moves no cash.
- Anyone may create an account with email confirmation. Group invite links expire after seven days, can be reused until revoked, and are accepted only after sign-in; public accounts gain no group or financial access until authorized through existing membership and RPC checks. Owners can add active friends directly and may allow other members to add their own active friends.

## Stack and structure

React 19, Vite, TypeScript, Tailwind CSS v4, Supabase JS, React Router 7, shadcn-compatible components, lucide-react, sonner, Recharts, GSAP, and Three.js. `src/landing/scene.ts` is a JavaScript port with `@ts-nocheck`; optional scene effects load dynamically. Shared API types are imported type-only from `../backend/src` through the `@backend/*` alias.

- `src/main.tsx`: public, auth, and app routes; Netlify rewrites deep links to `index.html` using the root `netlify.toml`.
- `src/App.tsx`: authenticated shell, navigation, notifications, and lazy feature pages.
- `src/pages/`: dashboard, groups, expenses, balances, settlements, pay-when-paid, recurring, friends/trust, and profile.
- `src/lib/supabase.ts`: typed Supabase client and `api` schema RPC boundary.
- `src/lib/session.ts`: Supabase Auth session and own-profile enrichment.
- `src/lib/store.tsx`: in-memory server data cache; clear on logout/account change and refresh after writes.
- `src/lib/api.ts`: route/rule helpers and request UUID generation.
- `src/landing/`: landing page and dynamically loaded WebGL scene.

## UI direction

Keep warm cream/ink palette, orange brand accent, spatial panels, pill buttons, current responsive layouts, and reduced-motion behavior. Reuse shared form, table, dialog, loading, empty, and error components. Use plain sentence-case copy. Distinguish route, outside payment, forwarding task, and cycle net in every label and confirmation.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build` in this directory. Do not lower Vite's chunk warning threshold to hide large bundles. Use `npm run dev` for local frontend work; copy `frontend/.env.example` to `.env.local` when connecting to hosted development.
