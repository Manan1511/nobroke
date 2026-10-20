# NoBroke backend

Supabase database foundation for NoBroke: groups, membership history, private income bands, INR expenses, auditable corrections, and recurring bill scheduling. The frontend uses the authenticated Supabase Data API through the `api` schema; see [the RPC contract](docs/backend-api.md).

The hosted development project is in Mumbai (`ap-south-1`), ref `wgsrncpjoqsjvqmsjvjc`: [open Supabase project](https://supabase.com/dashboard/project/wgsrncpjoqsjvqmsjvjc). It uses the free project tier. Do not commit keys or use the service-role key in a browser.

## Local development

Install Node.js 24, Docker Desktop, and the pinned Supabase CLI supplied by this package. Then run:

```sh
npm ci
npm run db:start
npm test
npm run test:db
npm run typecheck
```

`supabase start` prints local API keys and URLs. Auth confirmation emails are captured by local Mailpit at <http://127.0.0.1:54324>. Stop the local stack with `npm run db:stop`. `npm run db:reset` rebuilds it from migrations and the intentionally empty seed file.

Create local test users through Supabase Auth or Studio so the `auth.users` profile trigger runs. Keep test emails and passwords out of source control. Do not seed fixed credentials.

## Database changes

Migrations live in `supabase/migrations`. Create every new migration with `npx supabase migration new <descriptive_name>`, validate with `npm run db:reset` and both test suites, then apply it to the linked hosted development project after review. The hosted project is not linked in this repository and no access token is stored here.

The Data API exposes `api` alongside the platform schemas. App tables live in `app`; privileged functions and Person 3 hooks live in unexposed `private`. A migration pins PostgREST's exposed-schema list on the `authenticator` role so local and hosted behavior match; change that list through a migration rather than the Dashboard's Exposed Schemas control. Auth email remains in Supabase Auth. Private financials store only a band weight, never salary. The API returns money as decimal strings.

## Person 3 integration gate

Debt and settlement behavior is owned by Person 3. Expense posting, expense correction, and group departure call their synchronous SQL hooks inside the same transaction. Those operations fail closed until the real hooks are installed. Read [the integration contract](docs/person-3-integration.md) before combining migrations. The PGlite test harness provides doubles only for isolated tests; hosted migrations do not.

## Hosted Auth and Cron

Hosted testing is for project-team email addresses. Disable public signup in Supabase Auth settings while keeping email verification and password reset enabled; add redirect URLs only for the app's actual local and hosted origins. The default email sender has low testing limits, so do not use it for public signups.

The migration enables `pg_cron` but leaves its worker unscheduled. After Person 3's real hooks are installed and expense, correction, and hosted billing smoke tests pass, start `private.process_due_recurring_bills(50)` every 15 minutes using the SQL statement in [the API contract](docs/backend-api.md). Check `app.recurring_billing_runs` and the recurring template's backlog and sanitized failure fields when diagnosing a scheduled bill.

## Checks

GitHub Actions runs the PGlite behavior/security tests, TypeScript checks, and local Supabase pgTAP contract tests. Hosted integration still needs real Person 3 hooks and team-account smoke tests before the expense and recurring flows are ready for the frontend.
