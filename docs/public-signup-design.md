# NoBroke Public Signup Design

**Status:** approved by user

**Date:** 2026-10-23

## Goal

Let anyone create a NoBroke account from the existing landing-page auth panel. Keep email confirmation required and make signup work from both the public landing page and a one-use group invite.

## User flow

- The landing page offers **Log in** and **Create account**. The existing auth panel switches among login, signup, and password recovery.
- Signup asks for email and password, validates the same minimum password length as login, then calls Supabase Auth `signUp` with an email redirect to `/auth/callback`.
- The callback carries a validated in-app destination. A normal signup continues to `/app`; signup reached from an invite returns to that exact `/invite/:token` path so the new account can accept it after confirming email.
- After signup, show a neutral “Check your email” state. Do not show a signed-in success state before Supabase confirms the address. Keep the destination through email confirmation and show an expired-link path if confirmation cannot establish a session.
- Login and password reset retain their existing behavior. Signup errors use plain, non-sensitive messages.

## Security and data

- Supabase remains the identity provider. The browser uses only the publishable key; no service key is added to frontend configuration.
- Email confirmation stays enabled. Auth creates the minimal profile through the existing database trigger; signup does not trust client metadata for identity or authorization.
- Public accounts receive no group or financial access until authorized by existing membership and RPC checks. No financial tables, split logic, or RLS policies change for this feature.
- Local Supabase config allows email signup, requires email confirmation, uses an eight-character minimum password, and leaves SMS signup disabled. Hosted Auth currently reports signup enabled with email confirmation required. Match the eight-character password minimum in hosted settings, and add `https://nobroke.netlify.app/auth/callback**` to the hosted redirect allow-list for the dynamic `next` query used for invites.

## Scope and verification

Update the auth panel, landing entry points, safe callback routing, local Supabase config, and stale team-only signup documentation. Add focused tests for invite destination preservation and signup/callback states. Run frontend tests, typecheck, build, backend config checks, and `git diff --check`.

Public use depends on reliable confirmation-email delivery. Supabase's default sender only delivers to authorized organization-team addresses and has strict rate limits; configure custom SMTP before broad public onboarding.
