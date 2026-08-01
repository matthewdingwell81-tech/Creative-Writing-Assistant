/**
 * Tutorial system E2E tests.
 *
 * Covers:
 *  - Full tour launches via Help menu → card shows "Step 1 of N"
 *  - "Next" advances the step counter
 *  - "Prev" goes back one step
 *  - "Skip tour" dismisses the overlay
 *  - Focus Mode mini-tour launches from the first-use toast "Take tour →" action
 *  - Clicking "Done" on the last step persists the completion flag to localStorage
 *  - Help-menu replay launches a completed tour on demand
 *  - Missing-target auto-skip: a tour can be navigated through without hanging
 */
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset tutorial localStorage keys. */
async function clearTutorialState(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('lumina_tutorial_done');
    localStorage.removeItem('lumina_first_use');
  });
}

/**
 * Navigate to home and ensure the full-tour auto-launch has fired and been
 * dismissed. This gives each test a clean starting state where:
 *   - No tutorial overlay is visible
 *   - A document exists
 *   - `lumina_tutorial_done` does NOT have `full: true` (caller can set it)
 */
async function bootWithTutorialDismissed(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Force a known state: tutorial not completed → auto-launch will definitely fire
  await clearTutorialState(page);
  await page.reload();
  await page.waitForLoadState('networkidle');

  // The auto-launch fires after 800 ms; wait for it explicitly then dismiss
  await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });
  await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('tutorial-card')).not.toBeVisible({ timeout: 3_000 });

  // Create a document if this is a brand-new user
  const createFirstBtn = page.getByTestId('btn-create-first');
  const isNewUser = await createFirstBtn.isVisible({ timeout: 3_000 }).catch(() => false);
  if (isNewUser) {
    await createFirstBtn.click();
    await expect(page.getByTestId('save-status')).toBeVisible({ timeout: 8_000 });
  }
}

/** Dismiss tutorial overlay silently if still present (used in mobile-layout helper). */
async function dismissTutorialIfPresent(page: Page) {
  const card = page.getByTestId('tutorial-card');
  const isVisible = await card.isVisible({ timeout: 2_500 }).catch(() => false);
  if (isVisible) {
    const skipBtn = page.getByTestId('tutorial-skip');
    if (await skipBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await skipBtn.click();
    } else {
      await page.getByTestId('tutorial-dismiss').click();
    }
    await expect(card).not.toBeVisible({ timeout: 3_000 });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Tutorial system', () => {
  // Desktop viewport so all header controls are visible
  test.use({ viewport: { width: 1280, height: 720 }, isMobile: false });

  test('full tour auto-launches on first visit and shows step 1', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await clearTutorialState(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Tutorial card should appear automatically within a few seconds
    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });
    // Verify step counter reads "Step 1 of N"
    await expect(page.getByTestId('tutorial-card')).toContainText(/Step 1 of \d+/);

    // Clean up
    await page.getByTestId('tutorial-skip').click();
  });

  test('Help-menu full tour shows "Step 1 of N" on the card', async ({ page }) => {
    await bootWithTutorialDismissed(page);

    // Mark full tour done so the reload in boot doesn't auto-launch it
    await page.evaluate(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });

    // Launch full tour from Help menu
    await page.getByTestId('btn-help-menu').click();
    await page.getByTestId('tour-full').click();

    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });
    // Confirm the step counter text is "Step 1 of <number>"
    await expect(page.getByTestId('tutorial-card')).toContainText(/Step 1 of \d+/);

    await page.getByTestId('tutorial-skip').click();
  });

  test('"Next" advances the step counter', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await clearTutorialState(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('tutorial-card')).toContainText(/Step 1 of \d+/);

    await page.getByTestId('tutorial-next').click();

    // Step counter should now read 2 (or higher if step 2 was auto-skipped)
    await expect(page.getByTestId('tutorial-card')).toContainText(/Step [2-9]/, { timeout: 5_000 });

    await page.getByTestId('tutorial-skip').click();
  });

  test('"Prev" goes back one step', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await clearTutorialState(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('tutorial-card')).toContainText(/Step 1 of \d+/);

    // Advance to step 2
    await page.getByTestId('tutorial-next').click();
    await expect(page.getByTestId('tutorial-card')).toContainText(/Step [2-9]/, { timeout: 5_000 });

    // Go back — should return to step 1
    await expect(page.getByTestId('tutorial-prev')).toBeVisible({ timeout: 3_000 });
    await page.getByTestId('tutorial-prev').click();
    await expect(page.getByTestId('tutorial-card')).toContainText(/Step 1/, { timeout: 5_000 });

    await page.getByTestId('tutorial-skip').click();
  });

  test('"Skip tour" dismisses the overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await clearTutorialState(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });

    await page.getByTestId('tutorial-skip').click();

    await expect(page.getByTestId('tutorial-card')).not.toBeVisible({ timeout: 3_000 });
  });

  test('Focus Mode mini-tour launches from the first-use toast "Take tour →" action', async ({ page }) => {
    await bootWithTutorialDismissed(page);

    // Mark everything done so no auto-launches interfere
    await page.evaluate(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });
    // Clear first-use flags so the focusMode toast fires on next toggle
    await page.evaluate(() => {
      localStorage.removeItem('lumina_first_use');
    });

    // Click the Focus Mode button to trigger the first-use toast
    await page.getByTestId('btn-toggle-focus-mode').first().click();

    // The first-use toast appears after ~600 ms with a "Take tour →" action
    const toastAction = page.getByRole('button', { name: /Take tour/i });
    await expect(toastAction).toBeVisible({ timeout: 5_000 });
    await toastAction.click();

    // Tutorial card should now be visible showing the Focus Mode tour
    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('tutorial-card')).toContainText('Focus Mode');

    await page.getByTestId('tutorial-skip').click();
  });

  test('"Done" on the last step persists the completion flag to localStorage', async ({ page }) => {
    await bootWithTutorialDismissed(page);

    // Mark full tour done to prevent auto-launch interference
    await page.evaluate(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });

    // Launch the Focus Mode tour — it has only one visible step (shortest tour)
    await page.getByTestId('btn-help-menu').click();
    await page.getByTestId('tour-focusMode').click();

    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });

    // Navigate to the last step: click Next until we see Done, then click Done
    for (let i = 0; i < 20; i++) {
      const doneBtn = page.getByTestId('tutorial-done');
      if (await doneBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await doneBtn.click();
        break;
      }
      const nextBtn = page.getByTestId('tutorial-next');
      if (await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await nextBtn.click();
      } else {
        break;
      }
    }

    // Overlay should be gone
    await expect(page.getByTestId('tutorial-card')).not.toBeVisible({ timeout: 5_000 });

    // localStorage must have the focusMode tour flagged as done
    const isDone = await page.evaluate(() => {
      try {
        const stored = JSON.parse(localStorage.getItem('lumina_tutorial_done') || '{}');
        return stored['focusMode'] === true;
      } catch {
        return false;
      }
    });
    expect(isDone).toBe(true);
  });

  test('Help-menu button launches a tour on demand', async ({ page }) => {
    // Boot with tutorial dismissed so no overlay blocks the Help menu
    await bootWithTutorialDismissed(page);

    // Mark full tour as done so a reload doesn't auto-launch it again
    await page.evaluate(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });

    // Open Help menu (the ? icon in the header) and pick Focus Mode tour
    await page.getByTestId('btn-help-menu').click();
    await page.getByTestId('tour-focusMode').click();

    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('tutorial-card')).toContainText('Focus Mode');

    await page.getByTestId('tutorial-skip').click();
  });

  test('auto-skip works for steps without a visible target', async ({ page }) => {
    // Start clean, dismiss auto-launch, ensure document exists
    await bootWithTutorialDismissed(page);

    // Mark full tour done so it won't auto-launch on the next reload
    await page.evaluate(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });

    // Launch Chapters tour via Help menu
    await page.getByTestId('btn-help-menu').click();
    await page.getByTestId('tour-chapters').click();

    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });

    // Navigate through all steps (max 10 clicks) — should never freeze
    for (let i = 0; i < 10; i++) {
      const card = page.getByTestId('tutorial-card');
      const visible = await card.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!visible) break;

      const doneBtn = page.getByTestId('tutorial-done');
      const nextBtn = page.getByTestId('tutorial-next');
      const skipBtn = page.getByTestId('tutorial-skip');

      if (await doneBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await doneBtn.click();
        break;
      } else if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await skipBtn.click();
        break;
      } else if (await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await nextBtn.click();
      } else {
        break;
      }
    }

    // After completing/skipping, card should be gone
    await expect(page.getByTestId('tutorial-card')).not.toBeVisible({ timeout: 5_000 });
  });

  test('review-selection step shows hint and spotlights button once text is selected', async ({ page }) => {
    await bootWithTutorialDismissed(page);

    // Mark full tour done to prevent auto-launch interference
    await page.evaluate(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });

    // Type some content into the editor so there is text to select
    const editorArea = page.getByTestId('editor-area');
    if (await editorArea.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editorArea.click();
      await page.keyboard.type('Tutorial selection test content');
      await page.waitForTimeout(300);
    }

    // Launch the assistant feature tour which includes the review-selection step
    await page.getByTestId('btn-help-menu').click();
    await page.getByTestId('tour-assistant').click();

    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });

    // Navigate through steps until we reach "Review a Selection"
    for (let i = 0; i < 15; i++) {
      const card = page.getByTestId('tutorial-card');
      if (!(await card.isVisible({ timeout: 2_000 }).catch(() => false))) break;
      if (await card.getByText('Review a Selection').isVisible({ timeout: 400 }).catch(() => false)) break;
      const doneBtn = page.getByTestId('tutorial-done');
      if (await doneBtn.isVisible({ timeout: 300 }).catch(() => false)) break;
      const nextBtn = page.getByTestId('tutorial-next');
      if (await nextBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(300);
      } else {
        break;
      }
    }

    // Should now be on the "Review a Selection" step
    await expect(page.getByTestId('tutorial-card')).toContainText('Review a Selection', { timeout: 5_000 });

    // The hint text should be visible
    await expect(page.getByTestId('tutorial-card')).toContainText('Select some text', { timeout: 3_000 });

    // The full blocking backdrop must NOT be present — the page stays interactive
    await expect(page.locator('[data-testid="tutorial-backdrop-full"]')).not.toBeAttached();

    // The passthrough backdrop (pointer-events: none) should be present instead
    await expect(page.locator('[data-testid="tutorial-backdrop-missing"]')).toBeAttached({ timeout: 3_000 });

    // Now select text in the editor — the overlay is passthrough so this works
    const editor = page.getByTestId('editor-area');
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(600); // allow selectionchange → state update → MutationObserver

    // Once text is selected the "Review This Selection" button appears, the
    // MutationObserver fires, and the overlay should spotlight it
    await expect(page.locator('[data-testid="tutorial-backdrop-missing"]')).not.toBeAttached({ timeout: 5_000 });

    // Clean up
    await page.getByTestId('tutorial-skip').click();
    await expect(page.getByTestId('tutorial-card')).not.toBeVisible({ timeout: 3_000 });
  });

  // -------------------------------------------------------------------------
  // Full-tour end-to-end completion on a fresh account (no document open)
  //
  // Uses the shared e2e session but deletes all server-side documents via the
  // authenticated API before starting, so the DOM is in exactly the state of
  // a brand-new account: no editor, no chapters, no assistant tabs.
  // -------------------------------------------------------------------------

  test('full tour completes end-to-end on a fresh account without freezing', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // ── 1. Delete every server-side document for this account ────────────
    // This is the only reliable way to reach the "no document" state, because
    // earlier tests in the suite create documents for the shared e2e account.
    const docsRes = await page.request.get('/api/documents');
    expect(docsRes.ok(), `GET /api/documents failed: ${docsRes.status()}`).toBe(true);
    const docs: { id: number }[] = await docsRes.json();
    for (const doc of docs) {
      const del = await page.request.delete(`/api/documents/${doc.id}`);
      expect(del.ok(), `DELETE /api/documents/${doc.id} failed: ${del.status()}`).toBe(true);
    }

    // ── 2. Clear tutorial flags and reload so both server and client are clean
    await page.evaluate(() => {
      localStorage.removeItem('lumina_tutorial_done');
      localStorage.removeItem('lumina_first_use');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // ── 3. Assert the no-document state explicitly ────────────────────────
    // The "create your first document" CTA must be visible; this proves no
    // documents exist server-side and the UI reflects the empty state.
    await expect(
      page.getByTestId('btn-create-first'),
      'Expected empty-state CTA after deleting all documents',
    ).toBeVisible({ timeout: 5_000 });

    // ── 4. Full tour auto-launches on first visit ─────────────────────────
    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('tutorial-card')).toContainText(/Step 1 of \d+/);

    // ── 5. Walk every step ───────────────────────────────────────────────
    // Per-step timeout budget covers:
    //   - sideEffect delay (200 ms)
    //   - target-locate retry loop (20 × 50 ms = 1 000 ms)
    //   - a safety buffer
    // If a step ever freezes the card will vanish or the Next button will
    // never appear, causing the assertion below to time out and fail the test.
    const MAX_STEPS = 30; // FULL_TOUR has ~18 steps; headroom for future additions
    const STEP_TIMEOUT_MS = 4_000;

    let reachedDone = false;

    for (let i = 0; i < MAX_STEPS; i++) {
      const card = page.getByTestId('tutorial-card');

      // The card MUST remain visible at every step — a freeze shows up here
      await expect(card).toBeVisible({ timeout: STEP_TIMEOUT_MS });

      // If we're on the final step the Done button replaces Next
      const doneBtn = page.getByTestId('tutorial-done');
      if (await doneBtn.isVisible({ timeout: 600 }).catch(() => false)) {
        await doneBtn.click();
        reachedDone = true;
        break;
      }

      // Otherwise advance to the next step
      const nextBtn = page.getByTestId('tutorial-next');
      await expect(nextBtn).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      await nextBtn.click();
    }

    // ── 6. Assert completion ─────────────────────────────────────────────
    // The loop must have found and clicked Done — not just exhausted iterations
    expect(reachedDone, 'Done button was never reached; tour may have frozen').toBe(true);

    // Overlay must be gone after Done is clicked
    await expect(page.getByTestId('tutorial-card')).not.toBeVisible({ timeout: 3_000 });

    // localStorage must record the full tour as completed
    const storedDone = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('lumina_tutorial_done') || '{}')['full'] === true;
      } catch {
        return false;
      }
    });
    expect(storedDone, 'lumina_tutorial_done[full] not set after completing tour').toBe(true);
  });
});

// Export helper for use in mobile-layout.spec.ts
export { dismissTutorialIfPresent };
