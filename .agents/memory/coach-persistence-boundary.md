---
name: Coach persistence boundary
description: Why Coach restoration must be separate from generation and query accounting.
---

Restoring Coach conversations must be passive: never regenerate retained replies, retry interrupted prompts automatically, or count another query for loading history.

**Why:** Users leave the writing workspace to compare plans and must not lose replies they already used a query to obtain. Automatically retrying an interrupted request would spend a query without a new user action.

**How to apply:** Treat explicit, nonempty server completion as the boundary for both a retained reply and query accounting. Keep unfinished prompts as drafts, not completed exchanges, and ignore late responses after reset or a scope change.

Importing old device-local Coach history into an account must be an explicit, explained choice, not an automatic overwrite of cloud history.

**Why:** A different device can already have newer history or a deliberate reset. Automatic import would resurrect deleted replies or replace newer work. Original timestamps must survive import so migration does not restart retention.

**How to apply:** Restore saved account history first, offer an explicit replace-or-discard choice for a local recovery copy, and remove that copy only after confirmed import or explicit discard. Empty version markers may remain after reset/expiry to prevent stale writes; they contain no conversation text.
