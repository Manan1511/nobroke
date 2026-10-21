# NoBroke backend

Supabase database foundation for NoBroke: groups, membership history, private income bands, INR expenses, auditable corrections, and recurring bill scheduling. The separate frontend currently uses mock data and local storage; it is not connected to Supabase. See [the RPC contract](docs/backend-api.md) for the integration boundary.

The hosted development project is in Mumbai (`ap-south-1`), ref `wgsrncpjoqsjvqmsjvjc`: [open Supabase project](https://supabase.com/dashboard/project/wgsrncpjoqsjvqmsjvjc). It uses the free project tier. Do not commit keys or use the service-role key in a browser.

## Local development

Install Node.js 24. From this directory, install the pinned dependencies and run:

```sh
npm ci
npm test
npm run typecheck
```

The automated suite uses PGlite in-process to replay the migrations and exercise database behavior; it does not start a local Supabase stack. The optional PostgreSQL contract suite and generated types use the linked hosted development project.

Create test users in the hosted development project through Supabase Auth or Studio so the `auth.users` profile trigger runs. Use project-team email addresses and keep test emails and passwords out of source control.

## Database changes

Migrations live in `supabase/migrations`. Create every new migration with `npx supabase migration new <descriptive_name>`, then validate it with `npm test` and `npm run typecheck`. For optional checks against the hosted development database, authenticate with `npx supabase login`, link the project once with `npx supabase link --project-ref wgsrncpjoqsjvqmsjvjc`, and run `npm run test:db` or `npm run db:types`. Apply reviewed migrations to that project with `npx supabase db push`. No access token is stored in this repository.

The Data API exposes `api` alongside the platform schemas. App tables live in `app`; privileged functions and Person 3 hooks live in unexposed `private`. A migration pins PostgREST's exposed-schema list on the `authenticator` role so local and hosted behavior match; change that list through a migration rather than the Dashboard's Exposed Schemas control. Auth email remains in Supabase Auth. Private financials store only a band weight, never salary. The API returns money as decimal strings.

## Person 3 integration gate

Debt and settlement behavior is owned by Person 3. Expense posting, expense correction, and group departure call their synchronous SQL hooks inside the same transaction. Those operations fail closed until the real hooks are installed. Read [the integration contract](docs/person-3-integration.md) before combining migrations. The PGlite test harness provides doubles only for isolated tests; hosted migrations do not.

## Hosted Auth and Cron

Hosted testing is for project-team email addresses. Disable public signup in Supabase Auth settings while keeping email verification and password reset enabled; add redirect URLs only for the app's actual local and hosted origins. The default email sender has low testing limits, so do not use it for public signups.

The migration enables `pg_cron` but leaves its worker unscheduled. After Person 3's real hooks are installed and expense, correction, and hosted billing smoke tests pass, start `private.process_due_recurring_bills(50)` every 15 minutes using the SQL statement in [the API contract](docs/backend-api.md). Check `app.recurring_billing_runs` and the recurring template's backlog and sanitized failure fields when diagnosing a scheduled bill.

## Checks

GitHub Actions runs the PGlite behavior/security tests and TypeScript checks. Hosted integration still needs real Person 3 hooks and team-account smoke tests before the expense and recurring flows are ready for the frontend. The hosted PostgreSQL contract suite is opt-in through `npm run test:db`.
