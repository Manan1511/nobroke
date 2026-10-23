# NoBroke

NoBroke helps groups split shared expenses, track balances, and record confirmed outside payments. The repository keeps the frontend and Supabase backend in separate folders and package installations:

- [`frontend/`](frontend/README.md): React/Vite client connected to Supabase Auth and the database API. PostgreSQL owns financial calculations.
- [`backend/`](backend/README.md): Supabase schema, migrations, API contracts, debt-clearing hooks, and database tests. See [`backend/docs/person-3-integration.md`](backend/docs/person-3-integration.md) for the debt engine boundary.

## Run the frontend

```sh
cd frontend
npm ci
npm run dev
```

## Work on the backend

Follow the [backend setup and test instructions](backend/README.md). Its dependencies and Supabase CLI are isolated from the frontend package.

## Checks

From each package directory, run `npm ci` first. The frontend provides `npm run typecheck` and `npm run build`; the backend provides `npm test` and `npm run typecheck`. Its `npm test` suite replays the migrations in PGlite. Optional PostgreSQL contract checks run against a linked Supabase project with `npm run test:db`.
