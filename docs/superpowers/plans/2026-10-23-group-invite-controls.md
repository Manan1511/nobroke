# Group Invite Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make seven-day group invite links reusable, let owners add friends, and let owners control whether members can add their own friends.

**Architecture:** Extend the existing Supabase schema and authenticated `api` RPC contract. Store the member-add permission on each group, enforce owner/member/friend rules in private SQL functions under the shared financial-write lock, and expose the controls in the existing Groups screen. Keep owner removal guarded by the current obligation and recurring-bill checks.

**Tech Stack:** Supabase PostgreSQL, SQL/PLpgSQL, React, TypeScript, Node test runner, PGlite.

**Spec:** `docs/superpowers/specs/2026-10-23-group-invite-controls-design.md`

## Global Constraints

- No Docker, hosted migration, deployment, or dependency changes.
- Do not expose private tables or privileged helpers to the browser.
- Direct friend additions require an active friendship with the caller.
- New groups default to member friend additions disabled.
- Existing member removal remains blocked by active financial or recurring involvement.

## Review Focus

- Reusing one token across multiple users must succeed while an expired or revoked token must fail; test in the invite RPC case.
- A member cannot add a friend while group permission is disabled; test with distinct owner, member, and friend users.
- A member cannot enable the setting, add a non-friend, or remove another member; test private authorization boundaries.
- The owner must still be able to add a friend while the member-add setting is disabled and revoke a link after it was used; test both paths.
- The executor can run all new privileged routines after Auth schema access is revoked; test the JWT-subject compatibility helper.
- Owners can reload active invite metadata and revoke an older link without exposing its token; test owner-only listing and metadata shape.
- Direct table writes must remain denied to authenticated clients; assert group setting writes are only possible through RPC.

---

### Task 1: Database behavior and RPC contract

**Files:**
- Create: `backend/supabase/migrations/<timestamp>_group_invite_controls.sql`
- Modify: `backend/test/database.test.mjs`
- Modify: `backend/src/api-contract.ts`
- Modify: `backend/src/database.types.ts`

**Interfaces:**
- Produce `api.set_group_member_invites(p_group_id uuid, p_enabled boolean)`.
- Produce `api.add_group_friend(p_group_id uuid, p_friend_id uuid)`.
- Produce owner-only `api.list_group_invites(p_group_id uuid)` returning invite IDs and expiry metadata, never raw tokens or token hashes.
- `api.get_group(p_group_id uuid)` returns `members_can_invite_friends`.

- [x] Write failing PGlite cases for reusable/revocable invites, owner and member friend-add permission, active-friend validation, and default-off setting.
- [x] Run those cases and confirm they fail because the behavior and RPCs are missing.
- [x] Generate the migration with the installed Supabase CLI, then implement the columns, private authorization functions, locked invoker wrappers, updated group read, multi-use invite acceptance, and post-acceptance revocation.
- [x] Update the TypeScript RPC signatures and database function map.
- [x] Run focused PGlite cases, then the full backend test suite and typecheck.

### Task 2: Group settings and friend-add UI

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/store.tsx`
- Modify: `frontend/src/pages/Groups.tsx`

**Interfaces:**
- `Group.members_can_invite_friends` carries the authenticated `get_group` value into the page.
- The page calls the two Task 1 RPCs and refreshes group/member data after success.

- [x] Add the setting to the group type and populate it from `get_group`.
- [x] Replace one-use invite copy, restrict link controls to owners, and explain seven-day reuse and owner revocation.
- [x] Add the owner toggle and direct-add selector for the owner or permitted members, filtering to active friends not already in the group.
- [x] Preserve and verify the existing owner-only kick UI and its guarded backend behavior.
- [x] Run frontend tests, typecheck, build, and `git diff --check`.

### Task 3: Final contract review

- [x] Review grants, fixed `search_path`, authorization checks, shared lock ordering, and error behavior in the new migration.
- [x] Confirm no hosted database or deployment action was performed.
- [x] Report verification and any remaining hosted smoke tests.
