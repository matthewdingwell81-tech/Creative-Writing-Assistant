---
name: Account-scoped browser state
description: Migration rule for browser-persisted state that belongs to an authenticated Lumina account.
---

Persisted state that represents an individual user's activity must be keyed by the authenticated account ID. When replacing an old browser-wide key, copy its value to the first authenticated account that encounters it and remove the old key immediately.

**Why:** Copying preserves a sensible experience for existing users, while removing the legacy value prevents it from being inherited by every account that later uses the same browser.

**How to apply:** Use this migration pattern when converting existing browser-wide user activity. Keep device-level preferences browser-wide only when sharing them across accounts is intentional.