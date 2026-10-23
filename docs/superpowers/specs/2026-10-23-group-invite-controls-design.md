# Group Invites and Friend Adds

## Intent

Make group onboarding convenient while preserving owner control and the existing financial departure safeguards.

## Requirements

- A group invite link can be used by multiple people until seven days after creation or until its owner revokes it.
- Owners can reload a metadata-only list of active invite links and revoke any of them; raw link tokens and hashes are never listed.
- The owner can add an active friend directly, regardless of the member-invite setting.
- A group owner can enable or disable direct friend additions by other active group members. New groups default to disabled.
- Only active friends of the person performing a direct add can be added.
- The owner can remove members using the existing guarded removal flow. Open debt and recurring-bill involvement continue to block removal.
- Invite and membership mutations remain transactional, authenticated, and exposed only through `api` invoker wrappers backed by private authorization functions.

## Approach

Extend the existing group invite, membership, and API functions with a forward-only Supabase migration. Keep invitation tokens hashed, retain the seven-day expiry and owner-only link creation/revocation, and stop treating a recorded first acceptance as consuming a token. Store the member friend-add permission on the group with a false default. Add one authenticated RPC for an owner or permitted member to add an active friend and one owner-only RPC to change the setting. The existing `Groups` page provides the control and uses the current friends list. This reuses the project's established authorization and locking model; direct browser table writes or client-only permission checks would bypass it.

## Constraints and non-goals

- No Docker, hosted migration, deployment, or dependency changes.
- No new group-leave exceptions, debt changes, or public user discovery.
- The setting controls direct friend additions. Possession of an owner-created link still allows joining while that link is valid.
