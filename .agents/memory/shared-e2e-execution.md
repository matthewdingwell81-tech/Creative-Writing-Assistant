---
name: Shared E2E execution
description: Why overlapping full browser regression suites can fail unreliably in this workspace.
---

Do not run two full browser regression suites concurrently against the same workspace. Check whether a configured test workflow is already executing before starting a shell run or completion validation.

**Why:** Overlapping full-suite invocations caused intermittent document/chapter setup failures and mobile navigation timeouts even though the focused changed flows passed. Each invocation can open and update writing documents on the shared test account.

**How to apply:** Let an existing suite finish or stop its duplicate before validating. Do not interpret a shared-fixture setup failure as a feature defect without checking concurrent test activity.

Empty-workspace tests must use a dedicated account, never delete all documents from a shared account.

**Why:** A tutorial test's broad cleanup deleted a parallel Coach test's saved document, making a successful insert appear broken when reload received “not found.” Server-backed Coach revisions also turn parallel writes/resets on a shared document into legitimate conflicts, even when each browser has isolated local storage.

**How to apply:** Create isolated test data/accounts for destructive or empty-state setup. Cleanup should remove only records created by that test.

Workspace-dependent tests need their own account or document, rather than whichever shared-account document was updated most recently. Save-count assertions should distinguish the action being tested from unrelated background autosaves.

**Why:** A shared-account workspace can open a parallel test's temporary document, which disappears during that test's cleanup. Mobile UI interaction also gives a queued typing autosave time to arrive during an Insert assertion.

**How to apply:** Give tests ownership of their workspace fixtures and match the expected request payload when counting action-specific saves.

Exclude generated browser reports, traces, and saved authentication fixtures from the development server's file watcher.

**Why:** Generated report HTML was treated as app source and caused full-page reloads in other running tests, creating unrelated navigation and tutorial failures.

**How to apply:** Keep test output outside watched source or explicitly ignore its directories. Do not weaken assertions to accommodate these unexpected reloads.

Clear inherited authentication cookies before registering an isolated test account.

**Why:** Registration changes the identity attached to the existing server session. Reusing the shared saved-session cookie while registering makes parallel contexts switch to the new account too, despite their separate browser storage.

**How to apply:** Start with an unauthenticated context or clear that context's cookies before registration. A unique username alone does not provide session isolation.

Explicitly override project authentication even for manually created Playwright
contexts; `browser.newContext()` in a test can inherit the project's context defaults.

**Why:** A tutorial-switch context believed to be fresh inherited the saved shared
session. An ad test registering against that session then changed the tutorial
test's account mid-run, making completed tours appear to lose their progress.

**How to apply:** Pass an empty storage state when a manual context must start
anonymous, and use the account-registration helper that clears cookies for page
fixtures. Assert the expected account ID before attributing a scoped-storage
failure to the product.
