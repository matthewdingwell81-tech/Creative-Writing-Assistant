---
name: Complimentary developer Premium
description: Product policy for Firebase allowlisted accounts and the billing trust boundary
---

Allowlisted Firebase identities receive free Premium with the same UI as normal Premium accounts, without developer-mode indicators.

**Why:** The user explicitly requested automatic complimentary developer access while keeping it invisible in the app.

**How to apply:** Keep grants backend-authorized and tied to independently verified Firebase identities, preserve both sign-in methods, and retain the bounded signed offline window. Do not turn a frontend identity check or browser-stored secret code into entitlement authority.
