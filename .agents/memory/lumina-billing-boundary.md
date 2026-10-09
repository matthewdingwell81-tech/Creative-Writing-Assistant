---
name: Lumina billing trust boundary
description: Native billing provider limitations, dual-auth ownership, offline access and Firebase setup decisions
---

Use real Google Play billing for Lumina's Capacitor Android app. Do not assume the RevenueCat connector has Replit's simulated Test Store or install React Native purchases into this Vite app.

**Why:** This connection exposes the standard RevenueCat v2 API and rejected the `test_store` app type, although the generic RevenueCat skill assumes an Expo/Replit Test Store setup. Native Capacitor purchases use the official Capacitor SDK.

**How to apply:** Test store transactions with Google Play internal releases/license testers. Browser previews can test management UI but must not simulate commercially active native purchases.

Keep both existing sign-in methods. Resolve paid subscriptions through the authenticated Lumina account; only independently verified, account-matched Google identities can link a Firebase user document.

**Why:** The user explicitly retained dual auth, then requested real paid subscriptions. Backend receipt verification must support username/password accounts without requiring Firebase migration.

**How to apply:** Treat RevenueCat as authoritative. Firebase is a server-written mirror for Google accounts, not a browser-authorized entitlement source. Preserve the separate seven-day app trial and device-local ad-credit accounting.

Offline Premium is bounded to the paid-through expiry and a maximum 24 hours since backend verification. Cancellation alone does not revoke the already-paid period; price changes alone do not invalidate a subscription.

**Why:** The user requested offline receipt validation, cancellation/renewal handling, changed-pricing support and safe retries after lost confirmations.

**How to apply:** Never retry an uncertain store charge by immediately opening another checkout. Re-verify or restore first. Cached entitlement revocation cannot be instantaneous while offline; do not claim otherwise.

RevenueCat's webhook authorization header is write-only; its webhook configuration reads omit the secret.

**Why:** The provider accepted the configuration, but comparing its readback to the configured authorization value incorrectly appeared to fail because that field is not returned.

**How to apply:** Reapply the header when rotating the server secret. Verify the destination/app scope through readback and the authorization gate through safe HTTP probes; only a delivered event after publishing proves end-to-end delivery.
