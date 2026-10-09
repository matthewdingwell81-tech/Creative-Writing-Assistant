---
name: Freemium rollout policy
description: Trial eligibility for legacy accounts and deferred billing/enforcement scope
---

Existing Lumina accounts receive a fresh seven-day unlimited-AI trial beginning at the freemium rollout. New accounts receive seven days from their actual server-recorded signup time.

**Why:** Historical signup timestamps were not stored, and the user explicitly chose a new trial for existing accounts rather than beginning them immediately at five queries per day.

**How to apply:** Preserve that rollout start when migrating or revisiting account timestamps; do not restart a legacy account's trial on subsequent logins or deployments.

Native Premium subscriptions are now in scope at the user's requested $4.99/month price, with verified purchases, restore, renewal/cancellation handling, and expiry-based downgrades. Preserve the existing seven-day trial.

**Why:** The user explicitly expanded the earlier Coming Soon milestone to a real native upgrade flow. Paid access must reflect a verified subscription, not an unverified local Premium flag.

**How to apply:** Use the store's current product pricing at checkout; a price change alone must not invalidate an existing paid subscription. Cancellation stops renewal, not access before the paid-through expiry. Daily usage and ad bonuses remain device-local unless separately requested; do not assume they are server-enforced.
