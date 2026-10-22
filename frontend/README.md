# NoBroke frontend

React + TypeScript + Vite client for NoBroke. Auth and financial data use hosted Supabase; all financial calculations run in PostgreSQL. The app is team-only and has no public signup.

## Local development

```sh
npm ci
Copy-Item .env.example .env.local
npm run dev
```

The example contains only the hosted Supabase URL and publishable key. Keep any service-role key out of the frontend. No Docker is required.

## Routes and behavior

`/` is the landing/login page; `/auth/callback`, `/auth/reset`, `/auth/invite`, `/invite/:token`, and `/app/:section` handle Auth and protected app flows. Root `netlify.toml` builds this package and rewrites deep links to `index.html`.

The existing pages cover dashboard, groups, expenses, balances, confirmed outside payments, debt routes, pay-when-paid forwarding tasks, recurring bills, friends/trust, notifications, and profile/privacy. Debt routing changes obligations but moves no cash. A reported outside payment reduces debt only after creditor confirmation. Forwarding tasks also require a separate payment report and confirmation.

## Deployment

The root `netlify.toml` sets the Netlify base directory to `frontend`, runs `npm run build`, publishes `dist`, and rewrites app routes to `index.html`. Set these site environment variables in the Netlify dashboard using the values in `.env.example`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Only the publishable key belongs in frontend settings; never add a service-role key. After the site is available, set Supabase Auth's Site URL to `https://nobroke.netlify.app` and allow these exact redirect URLs: `/auth/callback`, `/auth/reset`, and `/auth/invite` on that origin. The local Supabase config also retains localhost callback URLs for development. Public signup remains disabled.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The frontend imports RPC types from `../backend/src/api-contract.ts`. See `../backend/docs/backend-api.md` for RPC names, payloads, error codes, and ownership boundaries.
