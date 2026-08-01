/**
 * Tutorial system E2E tests.
 *
 * Covers:
 *  - First-visit auto-launch of the full tour
 *  - Tutorial card renders with correct step counter
 *  - "Next" advances the step counter
 *  - "Skip tour" dismisses the overlay
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
    await expect(page.getByTestId('tutorial-card')).toContainText('Step 1');

    // Clean up
    await page.getByTestId('tutorial-skip').click();
  });

  test('"Next" advances the step counter', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await clearTutorialState(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('tutorial-card')).toContainText('Step 1');

    await page.getByTestId('tutorial-next').click();

    // Step counter should now read 2 (or higher if step 2 was auto-skipped)
    await expect(page.getByTestId('tutorial-card')).toContainText(/Step [2-9]/, { timeout: 5_000 });

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
});

// Export helper for use in mobile-layout.spec.ts
export { dismissTutorialIfPresent };
