---
name: Tutorial opt-out policy
description: Product boundary for account-wide tutorial disabling and progress resets.
---

Lumina's tutorial opt-out must sync across devices for the same account and suppress automatic tours, manual full/feature tours, and contextual tutorial prompts. Resetting tutorial progress must never turn tutorials back on. Re-enabling is an explicit Settings action.

**Why:** The user explicitly chose account-wide sync and requested a permanent, reversible opt-out independent of progress.

**How to apply:** Keep the preference separate from completion/reset state. Gate any new tutorial entry point through the shared preference; do not treat missing or failed initial preference loading as permission to show a tour.
