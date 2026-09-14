---
name: Firebase and API sessions
description: Why Lumina must bridge Firebase Google auth into its existing server-session authorization.
---

Firebase client state must not be used by itself to authorize Lumina's main UI. A successful Firebase Google redirect must exchange a verified Firebase ID token for the same server session used by document APIs. Username/password auth remains server-session based.

**Why:** The API authorizes through its server session. Rendering the app from Firebase state without creating that session caused every protected request to return 401 and created an auth-page/main-page redirect loop that made controls appear unresponsive.

**How to apply:** Any new Firebase provider must complete the server-session exchange before the app treats the user as authenticated. Session expiration must also clear client auth state immediately so protected UI unmounts.