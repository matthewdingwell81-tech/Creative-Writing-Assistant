---
name: Premium confirmation email policy
description: Recipient verification, access boundaries, and sender configuration constraints
---

Send Premium confirmations only to the linked identity's independently verified Firebase email. The email may explain access and open the app, but must never grant access or carry an unlock token.

**Why:** The user requires confirmation without weakening account ownership or server-verified subscription enforcement.

**How to apply:** Keep email failures separate from entitlement decisions; deduplicate deliveries durably and retry provider failures safely. The connected Resend credential is send-only, so a domain-listing denial does not imply sending is unavailable. Never claim a live delivery without testing it.

Leave the production sender configurable and unset until an authorized sender is available. Resend's test sender is for testing only. Do not use a Gmail address or invent an address on the Replit app hostname unless Resend confirms authorization.

**Why:** The user explicitly chose configurable production sending rather than supplying an address, and restricted the test sender to testing.

**How to apply:** Do not ask repeatedly for a sender or silently supply a fallback. Keep test transport/account usage separate from production confirmations, and do not mistake a deployed website hostname for a verified email domain.
