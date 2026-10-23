# Public Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let anyone create a NoBroke account in the existing auth panel, verify email, and resume the requested app or invite destination.

**Architecture:** Keep Supabase Auth as the only identity provider and extend the current modal with a signup mode. Add a validated callback destination to the confirmation link, route confirmed users only to safe in-app paths, and preserve invite tokens. Public account creation does not change database authorization or financial RPC behavior.

**Tech Stack:** React 19, TypeScript, React Router 7, Supabase JS 2.118.0, Supabase Auth config, Node's built-in test runner.

**Spec:** [docs/public-signup-design.md](../public-signup-design.md)

## Global Constraints

- Keep email confirmation enabled.
- Use only the Supabase publishable key in the browser; never add a service-role key.
- Preserve reusable seven-day invite tokens and only allow `/app`, `/app/...`, and `/invite/:token` callback destinations.
- Preserve all existing RLS and financial RPC authorization checks.
- Permit the callback route with its dynamic `next` query in local and hosted Auth redirect allow-lists.
- Do not modify the root untracked `PRD.md`.
- Do not use Docker or add dependencies.

## Review Focus

- Encoded invite tokens must survive the email callback and return to the matching invite route; test punctuation-bearing tokens.
- External, protocol-relative, auth-only, and otherwise unsupported callback destinations must resolve to `/app`; test each.
- Signup must require a valid email and at least eight password characters; recovery must not require a password; test each boundary.
- A successful signup response without a session must show confirmation instructions and must not navigate into the app; verify through the submitted state and the production build.
- A callback without a verified session must keep showing the expired-link state; verify the existing loading/session branches remain intact.

---

### Task 1: Validate callback destinations and confirmation return path

**Files:**
- Modify: `frontend/src/lib/auth-navigation.ts`
- Modify: `frontend/src/pages/AuthFlow.tsx`
- Test: `frontend/test/auth-navigation.test.mjs`

**Interfaces:**
- Produces `authCallbackPath(next: string | null): string`, returning `/auth/callback?next=<encoded-safe-destination>`.
- `AuthCallback` reads `next` from the query, applies `safePostLoginPath`, and redirects only after a session is available.

- [x] **Step 1: Add failing redirect tests**

  Add tests proving a punctuation-bearing `/invite/:token` path survives encoding, `/app/groups?tab=members` remains intact, and an external or unsupported path falls back to `/app`.

- [x] **Step 2: Run the focused test and confirm failure**

  Run from `frontend`: `node --test --test-name-pattern="confirmation callback" test/auth-navigation.test.mjs`

  Expected: FAIL because `authCallbackPath` is not exported.

- [x] **Step 3: Implement the helper and callback routing**

  Build the callback query from `safePostLoginPath`; in `AuthCallback`, read the query with React Router and use the sanitized path for `<Navigate>` when a session exists. Keep the loading and expired-link states.

- [x] **Step 4: Run the focused test and confirm it passes**

  Run: `node --test --test-name-pattern="confirmation callback" test/auth-navigation.test.mjs`

  Expected: PASS for allowed app/invite destinations and unsafe-destination fallback.

- [x] **Step 5: Commit the verified callback task**

  ```sh
  git add frontend/src/lib/auth-navigation.ts frontend/src/pages/AuthFlow.tsx frontend/test/auth-navigation.test.mjs
  git commit -m "fix(auth): preserve confirmation callback destinations"
  ```

### Task 2: Add signup to the existing auth panel

**Files:**
- Create: `frontend/src/lib/auth-validation.ts`
- Create: `frontend/src/lib/auth-signup.ts`
- Modify: `frontend/src/landing/AuthPanel.tsx`
- Modify: `frontend/src/landing/Landing.tsx`
- Modify: `frontend/src/landing/landing.css`
- Modify: `frontend/src/pages/AuthFlow.tsx`
- Modify: `frontend/test/auth-navigation.test.mjs`

**Interfaces:**
- `validateAuthForm(mode: "login" | "signup" | "recovery", email: string, password: string)` returns `{ emailError: string; passwordError: string; valid: boolean }`.
- `requestSignup(auth, email, password, emailRedirectTo)` calls Supabase `signUp` with the safe callback URL and resolves to `"confirmation_required"` only when Auth returns no error; the panel builds `emailRedirectTo` with `authCallbackPath(next)` and it ignores session data so the UI cannot claim a verified login.
- `AuthPanel` accepts `next: string` and supports `"login" | "signup" | "recovery"` modes.
- Signup calls `supabase.auth.signUp` with `emailRedirectTo` built from `authCallbackPath(next)`; only a successful Auth response enters the confirmation state.

- [x] **Step 1: Add failing validation tests**

  Test malformed email, password lengths 7 and 8 for login/signup, and recovery with an empty password. Mock `signUp` returning `{ session: null, error: null }` and assert `requestSignup` resolves to `"confirmation_required"` with the encoded invite callback URL; assert an Auth error rejects.

- [x] **Step 2: Run the focused tests and confirm failure**

  Run from `frontend`: `node --test --test-name-pattern="auth form validation" test/auth-navigation.test.mjs`

  Expected: FAIL because the validation and signup helpers are not exported.

- [x] **Step 3: Implement validation and signup states**

  Extend `AuthMode`; use `validateAuthForm` for all form modes and call `requestSignup` with `new URL(authCallbackPath(next), window.location.origin).toString()`. Clear the password after success and show neutral confirmation instructions without navigating. Keep login and reset behavior. Add mode-switch links, expose **Create account** from the landing hero, initialize `?auth=signup&next=...`, pass the safe destination to `AuthPanel`, and update the invite page to offer login or account creation.

- [x] **Step 4: Run frontend tests and typecheck**

  Run from `frontend`: `npm test && npm run typecheck`

  Expected: all tests pass and TypeScript reports no errors.

- [x] **Step 5: Commit the verified signup task**

  ```sh
  git add frontend/src/lib/auth-validation.ts frontend/src/lib/auth-signup.ts frontend/src/landing/AuthPanel.tsx frontend/src/landing/Landing.tsx frontend/src/landing/landing.css frontend/src/pages/AuthFlow.tsx frontend/test/auth-navigation.test.mjs
  git commit -m "feat(auth): add public signup flow"
  ```

### Task 3: Align Supabase config and product documentation

**Files:**
- Modify: `backend/supabase/config.toml`
- Modify: `frontend/README.md`
- Modify: `frontend/CLAUDE.md`
- Modify: `backend/README.md`
- Modify: `docs/public-signup-design.md`

- [x] **Step 1: Enable email signup locally**

  Set `[auth].enable_signup` and `[auth.email].enable_signup` to `true`; keep `[auth.email].enable_confirmations = true` and SMS signup disabled. Add `https://nobroke.netlify.app/auth/callback**`, `http://localhost:5173/auth/callback**`, and `http://127.0.0.1:5173/auth/callback**` to the redirect allow-list so encoded `next` query values are allowed. Document the matching hosted dashboard setting without changing unrelated project settings.

- [x] **Step 2: Replace stale team-only signup documentation**

  State that account creation is public with email confirmation, while groups and financial data remain protected by membership and existing database authorization. State that the default sender restricts delivery to organization-team addresses and has strict rate limits; custom SMTP is required for broad public delivery.

- [x] **Step 3: Run final checks**

  Run from `frontend`: `npm test`, `npm run typecheck`, `npm run build`. Run from `backend`: `npm test`, `npm run typecheck`. From the repository root run `git diff --check`.

  Expected: all checks pass; root `PRD.md` remains untouched.

- [x] **Step 4: Commit the verified config and documentation**

  ```sh
  git add backend/supabase/config.toml frontend/README.md frontend/CLAUDE.md backend/README.md docs/public-signup-design.md docs/superpowers/plans/2026-10-23-public-signup.md
  git commit -m "docs(auth): enable confirmed public signup"
  ```
