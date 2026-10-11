---
name: Complimentary developer Premium
description: Product policy for Firebase allowlisted accounts and the billing trust boundary
---

Allowlisted Firebase identities receive free Premium with the same UI as normal Premium accounts, without developer-mode indicators.

**Why:** The user explicitly requested automatic complimentary developer access while keeping it invisible in the app.

**How to apply:** Keep grants backend-authorized and tied to independently verified Firebase identities, preserve both sign-in methods, and retain the bounded signed offline window. Do not turn a frontend identity check or browser-stored secret code into entitlement authority.

Resolve entitlement initialization before rendering tier-dependent controls or initializing ads; a neutral loading/error screen is preferable to briefly treating a developer as Free.

**Why:** The user explicitly requested no flash of Free content on startup and reload, including when local tier state is reset.

**How to apply:** Keep all tier consumers consistent at their first mount, and isolate delayed verification results across sign-out and account switches. Any legacy global Premium flag is a compatibility mirror, not an entitlement source.
