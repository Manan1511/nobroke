# NoBroke backend

Supabase/PostgreSQL backend for groups, private income bands, expenses, debt obligations, trust, outside-payment confirmation, debt routing, forwarding tasks, cycle netting, notifications, and recurring bills.

Hosted development project is in Mumbai (`ap-south-1`), ref `wgsrncpjoqsjvqmsjvjc`: [open Supabase project](https://supabase.com/dashboard/project/wgsrncpjoqsjvqmsjvjc). App data is stored in `app`, browser RPCs in exposed `api`, and privileged functions/hooks in unexposed `private`. Never commit service-role keys or expose them to the frontend.

## Local development without Docker

Install Node.js 24, then run:

```sh
npm ci
npm test
npm run typecheck
```

`npm test` replays migrations in-process with PGlite; it does not start Docker or a local Supabase stack. `npm run test:db` and `npm run db:types` use the linked hosted development project.

## Migrations and contracts

Migrations live in `supabase/migrations`. Validate migration changes with `npm test` and `npm run typecheck`; apply reviewed changes to the linked project through the Supabase integration or CLI. `src/api-contract.ts` and `src/database.types.ts` define the shared RPC boundary. Money is returned as decimal strings. Supabase Auth owns account email; private income storage keeps only a band weight.

The production Person 3 hooks are `private.post_expense_obligations(uuid)`, `private.void_expense_obligations(uuid)`, and `private.assert_member_can_leave(uuid, uuid)`. The isolated PGlite harness provides doubles only for tests. Hooks execute within the caller's transaction and fail closed when unavailable.

## Hosted Auth and scheduler gates

Public email signup is enabled and email confirmation is required. `supabase/config.toml` declares `https://nobroke.netlify.app` as the hosted Site URL and allows `/auth/callback**`, `/auth/reset`, and `/auth/invite`, alongside localhost development routes. In the hosted Supabase Auth URL Configuration, allow `https://nobroke.netlify.app/auth/callback**` so signup confirmation can carry the validated `next` destination; keep the reset and invite routes allowed too. Local config sets an eight-character minimum password and disables SMS signup; match the eight-character minimum in hosted Auth settings. Until custom SMTP is configured, the hosted default sender only delivers to authorized organization-team addresses and has strict rate limits, so it cannot support broad public onboarding.

Recurring worker SQL exists, but hosted Cron remains unscheduled until real team-account, expense/correction, and billing smoke tests pass. Then schedule `private.run_recurring_worker()` every 15 minutes and observe a committed run, unique occurrence, obligations, notification, and run record. If that gate fails, remove the schedule and preserve ledger history for diagnosis.

## Checks

GitHub Actions runs backend PGlite behavior/security tests and TypeScript checks. The hosted PostgreSQL contract suite is opt-in with `npm run test:db`. See [API contracts](docs/backend-api.md) and [Person 3 integration](docs/person-3-integration.md).
