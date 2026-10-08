---
name: Coach persistence boundary
description: Why Coach restoration must be separate from generation and query accounting.
---

Restoring Coach conversations must be passive: never regenerate retained replies, retry interrupted prompts automatically, or count another query for loading history.

**Why:** Users leave the writing workspace to compare plans and must not lose replies they already used a query to obtain. Automatically retrying an interrupted request would spend a query without a new user action.

**How to apply:** Treat explicit, nonempty server completion as the boundary for both a retained reply and query accounting. Keep unfinished prompts as drafts, not completed exchanges, and ignore late responses after reset or a scope change.

Coach persistence for this milestone is device-local, isolated by account and writing document, rather than a cloud conversation archive.

**Why:** The requested return-navigation and reload behavior does not require a new server-side storage contract or cross-device synchronization. Local retention should not be described to users as an account backup.

**How to apply:** Preserve scope isolation and show a clear local retention policy. Cross-device history and synchronization between concurrent browser tabs are separate product work.
