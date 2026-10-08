---
name: Freemium rollout policy
description: Trial eligibility for legacy accounts and deferred billing/enforcement scope
---

Existing Lumina accounts receive a fresh seven-day unlimited-AI trial beginning at the freemium rollout. New accounts receive seven days from their actual server-recorded signup time.

**Why:** Historical signup timestamps were not stored, and the user explicitly chose a new trial for existing accounts rather than beginning them immediately at five queries per day.

**How to apply:** Preserve that rollout start when migrating or revisiting account timestamps; do not restart a legacy account's trial on subsequent logins or deployments.

Stripe and live Premium purchases are deferred. Daily usage and ad bonuses remain account-scoped device storage for this milestone, not authoritative server-enforced entitlements.

**Why:** The requested milestone deliberately stops at a Coming Soon comparison page and local query accounting.

**How to apply:** Treat server-side limits and billing activation as separate work, not as already secured or commercially active.
