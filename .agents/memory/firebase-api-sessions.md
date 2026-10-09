---
name: Firebase and API sessions
description: Why Lumina must bridge Firebase Google auth into its existing server-session authorization.
---

Firebase client state must not be used by itself to authorize Lumina's main UI. A successful Firebase Google redirect must exchange a verified Firebase ID token for the same server session used by document APIs. Username/password auth remains server-session based.

**Why:** The API authorizes through its server session. Rendering the app from Firebase state without creating that session caused every protected request to return 401 and created an auth-page/main-page redirect loop that made controls appear unresponsive.

**How to apply:** Any new Firebase provider must complete the server-session exchange before the app treats the user as authenticated. Session expiration must also clear client auth state immediately so protected UI unmounts.

Keep existing sign-in methods when extending tier tracking: Google accounts synchronize their tier through Firebase user documents; username/password accounts retain account-scoped local tiers.

**Why:** The user explicitly chose to retain the two existing sign-in methods instead of migrating every account to Firebase.

**How to apply:** Do not require Firebase login for server-only accounts or silently migrate their passwords. Cloud tier persistence is only applicable to a matching Firebase sign-in.

Verify entitlement-changing Firebase behavior using controlled mocks or a dedicated
staging/emulator environment, never by mutating real user tiers.

**Why:** Tier verification was explicitly scoped to avoid production mutations.
Passing client tests cannot establish deployed Google configuration, Firestore
rules, or purchase enforcement.

**How to apply:** Keep live-configuration checks separate from client behavior
coverage and report any live configuration that remains unverified.