# Lumina Premium billing

## Implemented

- Android uses the official `@revenuecat/purchases-capacitor` plugin, installed in both the web artifact and root native project.
- RevenueCat project `projc174b989`, Android app `appd4e4b7a907`, package name `com.lumina.app`.
- Subscription `lumina_premium:monthly`, entitlement `premium`, default offering and `$rc_monthly` package.
- The backend reads RevenueCat for the authenticated session's `lumina:<account ID>`. It does not trust a tier, receipt claim, customer ID, expiry, or price submitted by the browser.
- The SDK submits and retains the original store receipt. The app caches a backend-signed, account-bound verification receipt, valid offline for at most 24 hours and never beyond paid expiry.
- Cancellation stops renewal but retains access until expiry. Changed store prices do not invalidate a purchased subscription.
- An uncertain purchase sets a persistent pending marker before opening checkout. Retry verifies only; it never invokes another store purchase. Restore queries the store and re-verifies with the backend.
- Google logins can mirror verified subscriptions into their Firebase user documents; username/password logins continue to use their existing accounts and backend-verified RevenueCat subscriptions.
- Foreground, reconnect, periodic refresh, SDK customer-info updates, and authenticated webhooks re-check authoritative state.

## Required before live purchases

1. In Google Play, create/activate subscription `lumina_premium` with base plan `monthly`, a one-month period, and the requested **USD $4.99** price. Configure localized prices there. The app fetches the current store offering immediately before checkout and shows the actual localized price; the website's $4.99 label is a target, not a payment quote.
2. Link Google Play's billing/service-account configuration to this RevenueCat Android app. The Replit RevenueCat connection alone does not provision Google Play billing.
3. Use a Google Play internal-test release and license testers to test purchases, restoration, pending payments, cancellation and renewal on a real Android device. The standard RevenueCat connector here rejects the simulated `test_store` app type. Browser previews deliberately do not fake native purchases.
4. Set `FIREBASE_SERVICE_ACCOUNT_JSON` through Replit Secrets to a service-account JSON credential authorized for **lumina-app-22fd7** Firestore. Only server code reads it. Missing credentials leave verified device access working but show a cloud-sync warning; they do not result in client-authorized Premium writes.
5. Review and deploy `firestore.rules` to the existing Firebase project. Merge with any other required collections/rules rather than overwriting unrelated access policies. Subscription metadata and Premium grants must be writable only by the backend.
6. Set `REVENUECAT_WEBHOOK_AUTHORIZATION` through Secrets to a long random authorization value (for example a Bearer value). Configure RevenueCat's webhook at the published backend's `/api/billing/webhook`, with that exact Authorization header. Do not put the value in frontend code or this document. Initial purchase, renewal, cancellation, expiration, billing issues and transfers all re-read current provider state; duplicate or reordered events cannot apply stale entitlement claims.
7. Apply the additive `pnpm --filter @workspace/db run migrate:subscriptions` migration in the production database before releasing the updated backend. The migration links verified Firebase UIDs to existing accounts; it does not replace the database or add a second product catalog.
8. Publish the updated backend/web app, then build/sync the Android app. Verify the native server URL points to that published app, not an outdated release. Preserve the existing seven-day app trial independently of store billing.

## Verification

- `pnpm run typecheck`
- `pnpm --filter @workspace/lumina run test:tier`
- Existing `Sync Android` workflow builds and registers the native purchases plugin.

Logic tests use isolated fixtures/mocks and never charge a real customer. Browser status rendering tests do not prove store billing or live Firestore rules. Real billing cannot be declared ready until the device/store and Firebase configuration above has been checked.

## Offline trust and key rotation

The receipt signing key is derived on the backend from `SESSION_SECRET` with a billing-specific domain separator. Only its public JWK is exposed. Rotating that secret rotates new receipt signatures. An already-offline client can retain previously verified access only through the receipt's bounded offline window; live revocations and renewals become visible after reconnecting.
