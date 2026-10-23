# Signed-In Welcome Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the signed-in welcome screen before ENTER match the supplied NoBroke reference while preserving its existing animation and sign-in behavior.

**Architecture:** Keep the current `/` route and session conditional in `Landing.tsx`. Tune the existing hero composition in the landing stylesheet, adding only a narrow session-state class if needed to control the greeting and ENTER action without changing the logged-out state.

**Tech Stack:** React, TypeScript, Vite, CSS, existing CUA browser tooling.

**Spec:** `docs/superpowers/specs/2026-10-23-signed-in-entry-design.md`

## Global Constraints

- Keep the current NoBroke hero artwork, orange tube, floating icons, and entry animation.
- Preserve logged-out login and public signup behavior.
- Keep this landing-screen change separate from the dashboard, authentication, APIs, and backend behavior.
- Preserve keyboard access, navigation, reduced-motion behavior, and the user's no-autopublishing lock. Do not deploy through Netlify.

## Review Focus

- Wide screens: keep the wordmark prominent without clipping the tube, greeting, or ENTER action. Verify at the reference's wide aspect ratio.
- Standard desktop: keep the wordmark, tagline, and actions in the same visual order. Verify at 1280 by 720.
- Narrow screens: prevent overlap or horizontal scrolling. Verify at 390 by 844.
- Logged-out state: retain both login and create-account actions. Verify the root landing screen without a session.
- Reduced motion: keep all content visible when reduced motion is requested. Verify the existing reduced-motion rule remains effective.

---

### Task 1: Refine the signed-in hero composition

**Files:**
- Modify: `frontend/src/landing/landing.css`
- Modify only if needed to scope the visual state: `frontend/src/landing/Landing.tsx`

**Interfaces:**
- Consumes: `useSession()` state already used by `Landing.tsx`.
- Produces: the existing signed-in welcome scene with the greeting and one ENTER link; no route, auth, or API changes.

- [x] Inspect the signed-in hero rules, entry animation, and current desktop composition against the supplied screenshot.
- [x] Adjust the hero scale, vertical balance, greeting placement, and ENTER button treatment in the existing landing styles. Keep the wordmark and tube as the visual leads; keep the CTA visible within the viewport.
- [ ] Verify the signed-in state at the wide reference ratio, 1280 by 720, and 390 by 844. Verify the logged-out root state still shows LOG IN and CREATE ACCOUNT, and check reduced-motion mode. The local browser had no authenticated session for this final visual pass.
- [x] From `frontend`, run `npm test` and `npm run build`. From the repository root, run `git diff --check`.
- [x] Review the Impeccable findings and leave the attribution-unknown Inter warning unsuppressed pending design direction.
