# NoBroke — basic frontend (Person 1)

Basic frontend for the Social Liquidity & Expense Clearinghouse PRD.
Mock data only. No backend, no database, no real money logic.

## Run it
```
npm install
npm run dev
```

## Pages
| Page | What's on it |
|---|---|
| Dashboard | Totals, waiting rules alert, open balances, recent expenses, loading skeletons |
| Groups | Group cards, create group dialog, leave group confirm, group detail with tabs |
| Expenses | Table, search, add expense dialog (Equal / Exact / By income), delete confirm |
| Balances | "You owe" / "Owed to you" tabs, status badges, progress, remind button |
| Settle up | Pick a debt, find route (direct or through friends), trust-limit warning, confirm, history |
| Pay-when-paid | Rules table, new rule dialog, loop-detected alert, partial payment note, cancel confirm |
| Recurring bills | Bill cards with pause switch, new bill dialog, "billed once per date" note |
| Friends & trust | Trust limits with usage bars, edit limit, accept/decline requests, block |
| Profile & privacy | Account, private income (hidden input), notification switches |

## Every alert in the app
- Income split with fewer than 3 people → red alert, Save disabled (Expenses + Recurring)
- Exact amounts don't add up to total → red alert
- Income privacy notice → info alert (Expenses + Profile)
- Route goes over a friend's trust limit → red alert (Settle up: pick the Neha debt)
- Route found / pay directly → success alert (Settle up: pick the Rohan debt)
- Pay-when-paid rule closes a loop → info alert (pick "Aarav → You" then "You → Rohan")
- Partial payments are forwarded proportionally → info alert
- Trust limit set below what's already used → red alert
- Confirm dialogs: delete expense, leave group, settle, cancel rule, block friend
- Toasts after every action, empty states, spinners, skeletons

## Swapping in real shadcn components
Every file in `src/components/ui/` uses the **same file name and same exports as shadcn**.
To replace one with the real version:
```
npx shadcn@latest add button --overwrite
```
The pages don't need to change. Do them one at a time and check the app still runs.

Files that are simplified placeholders (replace these first):
`dialog`, `alert-dialog`, `sheet`, `dropdown-menu`, `tabs`, `tooltip`, `accordion`.
`src/lib/overlay.jsx` is only used by those placeholders; delete it once they're all replaced.

Notes:
- `native-select` is used instead of shadcn's `select` (simpler). You can keep it — shadcn has Native Select too.
- `checkbox`, `switch`, `radio-group` use `checked` / `onCheckedChange` / `onValueChange` like shadcn.
- Toasts already use the real `sonner` package.
- The sidebar is custom (`src/components/app-sidebar.jsx`). shadcn's Sidebar is a bigger block; swap it last.

## Handing over to the backend
`src/lib/api.js` is the API contract. Each function returns canned data in the shape the real
endpoint should return. Person 2/3 replace the bodies with `fetch()` calls.
`src/data/mock.js` mirrors the PRD tables — agree on these shapes with the backend team.
