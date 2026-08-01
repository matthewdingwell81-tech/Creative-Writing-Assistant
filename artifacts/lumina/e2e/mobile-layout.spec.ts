/**
 * Mobile layout regression tests — 375 px viewport.
 *
 * These tests guard against regressions in the responsive behaviour added to
 * Home.tsx: overflow menu, sheet-based sidebars, and the Sparkles FAB.
 *
 * Auth state is set up by global-setup.spec.ts (runs first via Playwright
 * project dependencies).
 */
import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to home and, if no document exists yet, create one. */
async function ensureDocument(page: import('@playwright/test').Page) {
  await page.goto('/');

  // The app may briefly show a loading spinner — wait for it to resolve.
  await page.waitForLoadState('networkidle');

  const createFirstBtn = page.getByTestId('btn-create-first');
  const isNewUser = await createFirstBtn.isVisible({ timeout: 3_000 }).catch(() => false);

  if (isNewUser) {
    await createFirstBtn.click();
    // Wait for document to load (save-status chip appears)
    await expect(page.getByTestId('save-status')).toBeVisible({ timeout: 8_000 });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Mobile layout – 375 px viewport', () => {
  test('body has no horizontal scrollbar', async ({ page }) => {
    await ensureDocument(page);

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > document.body.clientWidth;
    });

    expect(hasHorizontalOverflow).toBe(false);
  });

  test('overflow menu button is visible and opens a dropdown', async ({ page }) => {
    await ensureDocument(page);

    const overflowBtn = page.getByTestId('btn-mobile-overflow');
    await expect(overflowBtn).toBeVisible();

    await overflowBtn.click();

    // At least one document-type item should be visible in the dropdown
    await expect(page.getByTestId('mobile-doc-type-fiction')).toBeVisible({ timeout: 3_000 });
  });

  test('suggestions FAB is present and tappable', async ({ page }) => {
    await ensureDocument(page);

    const fab = page.getByTestId('btn-open-suggestions-sheet');
    await expect(fab).toBeVisible({ timeout: 5_000 });

    // Tapping the FAB should open the suggestions sheet (a radix Sheet dialog)
    await fab.click();
    // The Sheet renders as role="dialog" — wait for it to appear
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3_000 });
  });

  test('document list sheet opens when the toggle button is pressed', async ({ page }) => {
    await ensureDocument(page);

    // Ensure any open sheet is closed first
    const existingDialog = page.locator('[role="dialog"]');
    if (await existingDialog.isVisible({ timeout: 500 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await existingDialog.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
    }

    const toggleBtn = page.getByTestId('toggle-doc-list');
    await expect(toggleBtn).toBeVisible();

    await toggleBtn.click();

    // Sheet should open — it has role="dialog"
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3_000 });

    // The Sheet renders a SheetTitle with the text "Documents"
    await expect(page.locator('[role="dialog"] h2')).toContainText('Documents', { timeout: 3_000 });
  });
});
