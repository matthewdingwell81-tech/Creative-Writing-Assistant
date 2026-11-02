---
name: Account-scoped browser state
description: Migration rule for browser-persisted state that belongs to an authenticated Lumina account.
---

Persisted state that represents an individual user's activity must be keyed by the authenticated account ID. When replacing an old browser-wide key, copy its value to the first authenticated account that encounters it and remove the old key immediately.

**Why:** Copying preserves a sensible experience for existing users, while removing the legacy value prevents it from being inherited by every account that later uses the same browser.

**How to apply:** Use this migration pattern when converting existing browser-wide user activity. Keep device-level preferences browser-wide only when sharing them across accounts is intentional.

In-memory query caches and API HTTP responses also need account boundaries. Lumina's shared document-list query cached titles and writing indefinitely; key it by authenticated account ID, clear user query data on logout, and mark private API responses `private, no-store`.

**Why:** A browser-wide query key combined with an infinite stale time exposed the previous account's cached document metadata and text after switching accounts, even though the API correctly enforced document ownership. HTTP caches should not retain authenticated writing responses for reuse.

**How to apply:** Scope sensitive query keys by authenticated account ID, clear the query client on logout/session end, and disable HTTP caching on private API responses. Do not clear unrelated localStorage or browser preferences as a substitute.