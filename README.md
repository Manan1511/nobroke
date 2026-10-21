# NoBroke

NoBroke is a group expense and debt-clearing web app. The repository keeps the frontend and Supabase backend in separate folders and package installations:

- [`frontend/`](frontend/README.md) — Person 1's React/Vite interface. It currently uses mock data and local storage; it contains no backend or financial business logic.
- [`backend/`](backend/README.md) — Person 2's Supabase migrations, API contracts, and database tests. Person 3's debt-clearing hooks are documented in [`backend/docs/person-3-integration.md`](backend/docs/person-3-integration.md).

## Run the frontend

```sh
cd frontend
npm ci
npm run dev
```

## Work on the backend

Follow the [backend setup and test instructions](backend/README.md). Its dependencies and Supabase CLI are isolated from the frontend package.

## Checks

From each package directory, run `npm ci` first. The frontend provides `npm run typecheck` and `npm run build`; the backend provides `npm test`, `npm run typecheck`, and `npm run test:db` (the database test needs Docker and a local Supabase stack).
