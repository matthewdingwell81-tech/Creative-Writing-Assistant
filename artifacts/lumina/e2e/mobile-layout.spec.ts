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

/** Dismiss the in-app tutorial overlay if it is currently visible. */
async function dismissTutorialIfPresent(page: import('@playwright/test').Page) {
  const card = page.getByTestId('tutorial-card');
  const isVisible = await card.isVisible({ timeout: 2_000 }).catch(() => false);
  if (isVisible) {
    const skipBtn = page.getByTestId('tutorial-skip');
    if (await skipBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await skipBtn.click();
    } else {
      const dismissBtn = page.getByTestId('tutorial-dismiss');
      await dismissBtn.click();
    }
    await expect(card).not.toBeVisible({ timeout: 3_000 });
  }
}

/** Navigate to home and, if no document exists yet, create one. */
async function ensureDocument(page: import('@playwright/test').Page) {
  await page.goto('/');

  const authResponse = await page.request.get('/api/auth/me');
  if (authResponse.ok()) {
    const authPayload = await authResponse.json();
    const currentUser = authPayload.user ?? authPayload;
    await page.evaluate((accountId: string) => {
      localStorage.setItem(
        `lumina_tutorial_done:${encodeURIComponent(accountId)}`,
        JSON.stringify({ full: true }),
      );
    }, String(currentUser.id));
  }

  // The app may briefly show a loading spinner — wait for it to resolve.
  await page.waitForLoadState('networkidle');

  // Dismiss tutorial overlay if the first-visit auto-launch fired
  await dismissTutorialIfPresent(page);

  const createFirstBtn = page.getByTestId('btn-create-first');
  const isNewUser = await createFirstBtn.isVisible({ timeout: 3_000 }).catch(() => false);

  if (isNewUser) {
    await createFirstBtn.click();
    // Wait for document to load (save-status chip appears)
    await expect(page.getByTestId('save-status')).toBeVisible({ timeout: 8_000 });
  }
}

async function expectWithinViewport(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
) {
  await expect(locator).toBeVisible();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    return box !== null
      && box.x >= 0
      && box.y >= 0
      && box.x + box.width <= viewport!.width + 1
      && box.y + box.height <= viewport!.height + 1;
  }, { timeout: 3_000 }).toBe(true);
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

  test('key controls stay accessible across phone, tablet, and desktop widths', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568, compact: true },
      { width: 667, height: 375, compact: true },
      { width: 768, height: 600, compact: true },
      { width: 1024, height: 600, compact: true },
      { width: 1280, height: 720, compact: true },
      { width: 1440, height: 720, compact: false },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await ensureDocument(page);

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        body: document.body.scrollWidth > document.body.clientWidth,
      }));
      expect(overflow, `${viewport.width}x${viewport.height} should not scroll horizontally`).toEqual({
        document: false,
        body: false,
      });

      await expectWithinViewport(page, page.getByTestId('toggle-doc-list'));
      await expectWithinViewport(page, page.getByTestId('save-status'));
      await expectWithinViewport(
        page,
        page.getByTestId(viewport.compact ? 'btn-mobile-overflow' : 'select-doc-type'),
      );

      if (viewport.compact) {
        await expect(page.getByTestId('toggle-doc-list')).toHaveAccessibleName(/document list/i);
        await expect(page.getByTestId('btn-mobile-overflow')).toHaveAccessibleName('Open workspace menu');
      } else {
        for (const testId of ['btn-toggle-focus-mode', 'btn-help-menu', 'btn-import-gdocs', 'btn-new-doc', 'btn-export-menu', 'btn-user-menu']) {
          await expectWithinViewport(page, page.getByTestId(testId));
        }
      }
    }
  });

  const compactPanels = [
    { name: 'document list', trigger: 'toggle-doc-list' },
    { name: 'scratchpad', trigger: 'btn-toggle-scratchpad' },
    { name: 'Creative Assistant', trigger: 'btn-open-suggestions-sheet' },
    { name: 'Research Context', trigger: 'fab-research' },
  ];

  for (const panel of compactPanels) {
    test(`${panel.name} panel fits inside a narrow phone viewport`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await ensureDocument(page);
      await dismissTutorialIfPresent(page);

      await page.getByTestId(panel.trigger).click();
      await expectWithinViewport(page, page.locator('[role="dialog"]'));

      if (panel.name === 'document list') {
        await expectWithinViewport(page, page.locator('[role="dialog"] h2'));
      } else if (panel.name === 'scratchpad') {
        await expectWithinViewport(page, page.getByTestId('input-new-idea'));
        await expect(page.getByTestId('btn-add-idea')).toHaveAccessibleName('Add idea');
      } else if (panel.name === 'Creative Assistant') {
        await expectWithinViewport(page, page.getByRole('heading', { name: 'Creative Assistant' }));
      } else if (panel.name === 'Research Context') {
        await expectWithinViewport(page, page.getByTestId('tab-related'));
        await expectWithinViewport(page, page.getByTestId('btn-quick-add-research'));
      }
    });
  }

  test('Research Library uses compact controls at tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 600 });
    await ensureDocument(page);
    await dismissTutorialIfPresent(page);

    await page.getByTestId('btn-mobile-overflow').click();
    await page.getByTestId('mobile-view-research').click();

    await expect(page.getByTestId('research-library')).toBeVisible();
    await expectWithinViewport(page, page.getByTestId('input-search-research'));
    await expectWithinViewport(page, page.getByTestId('btn-mobile-filters'));
    await expectWithinViewport(page, page.getByTestId('btn-add-research-mobile'));
    await expect(page.getByTestId('btn-mobile-filters')).toHaveAccessibleName('Open research filters');

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
