# Firebase tier and account-switch verification

## Reproducible, isolated checks

Run from the workspace root:

```sh
pnpm --filter @workspace/lumina run test:tier
pnpm --filter @workspace/lumina run typecheck
pnpm --filter @workspace/lumina run typecheck:tier
```

The Vitest configuration is separate from the live Vite/Playwright configuration.
Tests replace `@/lib/firebase`, `firebase/auth`, and `firebase/firestore` before
loading application code. AuthProvider's API requests are also mocked. No test
initializes Firebase, signs into a real Google account, uses server test accounts,
or reads/writes a live Firestore document.

### Covered with controlled client mocks

- Google tiers are read from `users/{Firebase UID}`, not the Lumina server ID.
  Confirmed free/premium snapshots update the account-scoped device cache.
- Tier writes merge only tier/timestamp fields into the matching profile and do
  not grant a new tier until the write is acknowledged.
- Both absent profiles and existing profiles missing a tier initialize in a
  transaction. A concurrent premium purchase observed by the transaction is
  preserved. Cached/pending snapshots do not initialize a profile, and duplicate
  snapshots do not start overlapping initialization transactions.
- Pending/offline snapshots never apply an unconfirmed tier. Rejected writes
  retain the prior tier. Listener/auth/transaction failures preserve the saved
  cache and emit an account-scoped warning; the real sidebar displays that warning.
- AuthProvider restores server sessions and exchanges a Google redirect token
  before exposing the account. A failed exchange exposes no Firebase-only tier.
- Logout, session expiry, account switches, and provider unmount dispose active
  listeners. Late callbacks cannot leak tiers between accounts or Firebase
  identities. Delayed auth readiness is checked before writing; writes already
  submitted cannot update the cache after an identity/account change.
- Username/password login and registration stay local, including when an
  unrelated Firebase user remains signed in. No unrelated document is opened,
  provisioned, or written. Anonymous/invalid changes are rejected.

## Live Google/Firestore configuration NOT verified

Client mocks verify application decisions, not actual service configuration or
the SDK's network/transaction semantics. This work intentionally made no live
Google/Firestore mutations. The following remain separate release checks:

- Google provider enabled in the intended Firebase project; authorized preview,
  published, and Android redirect domains/origins; a real redirect round-trip.
- Server Firebase Admin credentials/project alignment and real ID-token
  verification for the Google-to-Lumina session exchange.
- Firestore database availability and deployed rules permitting only appropriate
  access to `users/{uid}`. This client test does **not** establish that users cannot
  self-assign premium. Live billing/server entitlement enforcement remains deferred.
- Real SDK offline queuing/reconnect acknowledgements, transaction conflict
  retries, listener errors, and permission-denied behavior under deployed rules.
- Persistence across devices for a real Google account and native Android auth.

Verify these with a dedicated staging project/test Google identities or a
Firestore emulator configured with the intended rules, not production purchases.
