---
name: Premium confirmation email policy
description: Recipient verification, access boundaries, and sender configuration constraints
---

Send Premium confirmations only to the linked identity's independently verified Firebase email. The email may explain access and open the app, but must never grant access or carry an unlock token.

**Why:** The user requires confirmation without weakening account ownership or server-verified subscription enforcement.

**How to apply:** Keep email failures separate from entitlement decisions; deduplicate deliveries durably and retry provider failures safely. The connected Resend credential is send-only, so a domain-listing denial does not imply sending is unavailable. Ask for an authorized sender address, not broader credentials, and never claim a live delivery without testing it.
