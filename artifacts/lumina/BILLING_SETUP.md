# Lumina Premium billing

## Implemented

- Android uses the official `@revenuecat/purchases-capacitor` plugin, installed in both the web artifact and root native project.
- RevenueCat project `projc174b989`, Android app `appd4e4b7a907`, package name `com.lumina.app`.
- Subscription `lumina_premium:monthly`, entitlement `premium`, default offering and `$rc_monthly` package.
- Linked Google accounts use `lumina:<verified Firebase UID>` as their canonical RevenueCat identity. The server also reads the existing `lumina:<Lumina account ID>` customer to preserve earlier purchases. Password-only accounts keep that account-ID identity. The SDK receives its identity from account-bound `/api/billing/config`, not browser-supplied claims.
- The backend does not trust a tier, receipt claim, customer ID, expiry, or price submitted by the browser.
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
7. Ensure the development database has the additive subscription and confirmation-email migrations (`pnpm --filter @workspace/db run migrate:subscriptions` and `pnpm --filter @workspace/db run migrate:billing-emails`). Both are included in post-merge setup. For Replit-managed production PostgreSQL, review the development-to-production schema diff in Publish rather than manually running development migration scripts against production.
8. Publish the updated backend/web app, then build/sync the Android app. Verify the native server URL points to that published app, not an outdated release. Preserve the existing seven-day app trial independently of store billing.
9. Configure the non-secret `LUMINA_BILLING_EMAIL_FROM` with a sender authorized by the connected Resend account. The connection is send-only; it cannot list verified domains. Do not substitute an unverified sender or request a broader API key just to send mail.

Leave that setting empty until an authorized production sender is available; there is no automatic sender fallback. Never invent an address on the Replit app URL or use a Gmail sender without explicit Resend verification. A web app hostname does not establish email-sending authorization.

For isolated testing only, explicitly configure Resend's `onboarding@resend.dev` sender in a development/test environment and follow Resend's recipient restrictions. The app rejects `resend.dev` senders in production or an unspecified environment. Automated email tests use that sender with a mocked transport; they do not send email. Do not enable it globally for production Premium confirmations or treat a simulated delivery as proof of real inbox delivery.

## Firestore fields and independent manual access

Existing fields are retained, without renames:

| Field | Meaning |
| --- | --- |
| `tier` | Effective server-verified `premium` or `free`, including complimentary access |
| `subscriptionId` | RevenueCat paid subscription ID, or null if no paid subscription |
| `expiresAt` | Paid-through expiry in milliseconds, or null |
| `subscriptionStatus` | Current provider-derived paid subscription status |
| `subscriptionVerifiedAt` | Effective entitlement verification timestamp in milliseconds |
| `manualPremiumAccess` | New server-owned boolean reflecting the owner-maintained Firebase UID allowlist |

Paid expiry, cancellation, and refunds do not remove an allowlisted account's independent grant. Removing the UID from the owner-maintained allowlist removes that grant at the next successful online verification. If RevenueCat is unavailable for an allowlisted account, complimentary access can still be verified; existing paid metadata is left unchanged rather than inventing provider state.

Writes merge into `users/<verified Firebase UID>` without replacing unrelated profile data. A transaction rejects an older verification timestamp. The rules source permits owner-only single-document reads and denies all client creates, updates, deletes, and collection listing. No Firebase deployment configuration is present, so these source rules have **not** been confirmed as the project's deployed rules.

## Confirmation email and retry behavior

Premium confirmation goes only to the linked Firebase Authentication user's current `email` when Firebase Admin confirms `emailVerified`. A Lumina username, client-provided address, or webhook payload is not accepted as the recipient. Password-only and unverified identities are skipped.

The email says Premium is active, asks the user to sign in with the associated Google account (and the purchase account for a paid subscription), and links to the published app. The link contains no entitlement token or unlock parameter. Opening it grants nothing; normal authentication and server verification still apply.

Delivery uses the existing Resend connection and a persistent database record keyed by account plus paid subscription ID, with a separate key for complimentary access. Concurrent attempts share a delivery claim, successful records suppress later sends, and retries reuse the same provider idempotency key. A failed or abandoned attempt can be retried by the next subscription verification or RevenueCat webhook. There is no independent background email worker. Resend's idempotency-retention window still bounds protection in the rare case of provider acceptance followed by a database-commit failure.

Normal subscription responses do not revoke Premium because email delivery failed. An authenticated webhook returns 503 when required cloud synchronization or eligible email delivery cannot finish, so RevenueCat can retry; Free or unverified-email accounts do not receive a confirmation. Sender configuration is required before live email testing. `LUMINA_WEB_APP_URL` may override the published URL if the domain changes; it must be HTTPS.

## Verification

- `pnpm run typecheck`
- `pnpm --filter @workspace/lumina run test:tier`
- Existing `Sync Android` workflow builds and registers the native purchases plugin.

Logic tests use isolated fixtures/mocks and never charge a real customer. Browser status rendering tests do not prove store billing or live Firestore rules. Real billing cannot be declared ready until the device/store and Firebase configuration above has been checked.

The tier suite covers paid renewal/cancellation/expiry/refund interpretation, wrong entitlements, restore and uncertain-purchase retries, Firebase/legacy customer mapping, account switches, independent manual grants, duplicate/reordered authenticated webhooks, email deduplication/retry, and the Firestore rules **source contract**. It does not replace a Google Play internal-release purchase/restore test, a real Resend delivery, a Firebase Rules emulator/deployment check, or a delivered production webhook.

## Offline trust and key rotation

The receipt signing key is derived on the backend from `SESSION_SECRET` with a billing-specific domain separator. Only its public JWK is exposed. Rotating that secret rotates new receipt signatures. An already-offline client can retain previously verified access only through the receipt's bounded offline window; live revocations and renewals become visible after reconnecting.

## Complimentary developer access

`artifacts/api-server/src/lib/developerIds.json` is the shared Firebase UID allowlist, exported as `DEVELOPER_IDS` in `src/lib/userTier.ts`. Only add accounts you intend to grant free Premium. UIDs are identifiers, not secret unlock codes.

Sign in with the allowlisted Google/Firebase account. The backend independently verifies and links its Firebase ID token before issuing normal Premium state and an account-bound signed receipt. No purchase is required, and there are no developer-mode indicators. Username/password-only accounts without a verified Firebase link do not qualify.

Complimentary access has no billing expiry, but its offline verification still expires after 24 hours. Removing a UID and publishing the updated app revokes the grant on the next online verification; an already-offline device may retain access until its receipt expires. Existing paid subscriptions continue through RevenueCat. The optional shared-code unlock is intentionally not enabled.

Authenticated tier-dependent content waits for online subscription verification or a valid signed offline receipt before mounting. Failed initial verification shows a neutral retry/sign-out screen, not temporary Free controls or ads. The existing account-scoped tier remains authoritative; `lumina.admob.premium` is a compatibility mirror populated from verified state and reset on account change or sign-out, never a standalone unlock.

Copy allowlist identifiers from Firebase Authentication, not the Lumina server account ID. Firebase tokens must have a verified email under the existing auth policy; allowlisting alone does not override that check or manufacture a token. Google sign-in can supply a verified Firebase identity, while username/password Lumina accounts continue to work without Firebase.

### Firebase session recovery

`GET /api/auth/me` accepts either the existing Lumina session cookie or a Firebase ID token in `Authorization: Bearer <token>`. Tokens are verified against Google's signing keys with this project's issuer/audience, expiry, and verified-email checks. A valid Firebase identity is linked by UID (or verified email for first-time linking) and creates/saves the server session used by document and billing APIs. Explicit Google redirect exchange uses `POST /api/auth/firebase-session` with the same rules.

The response includes `firebaseUid` and `premium: true` for a verified allowlisted identity. For other identities, `premium: null` means billing has not been queried by this identity endpoint, not that a paid subscriber is Free. The subscription endpoint and its signed receipt still determine the UI tier. Passive restoration preserves an existing unrelated username/password session; explicit Google sign-in can intentionally change accounts.

A 401 remains correct for missing or invalid authentication. Never send the Lumina account UUID in place of a Firebase ID token, and never treat an allowlist string alone as proof of ownership.

### Firebase UID uniqueness and database rollout

Firebase UID account resolution is serialized per verified UID in a database transaction. The partial unique index `users_firebase_uid_unique` remains the database-level safeguard; the Drizzle schema declares the same index, and `lib/db/migrations/subscriptions.sql` adds it for databases using that migration. A unique-key race restores the account already linked to that UID rather than provisioning another account.

The development and production databases were checked read-only on October 16, 2026: neither had duplicate non-null Firebase UID links, and both already had the unique index. No production schema or account data was changed for this work. If another environment lacks the index, review its duplicate UID links first and apply the schema change through the normal Publish schema review. Do not delete or merge accounts or documents to make the index succeed without explicit approval.
