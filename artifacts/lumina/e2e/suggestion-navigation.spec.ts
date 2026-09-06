import { expect, test, type Page } from '@playwright/test';

type SuggestionType = 'grammar' | 'vocabulary' | 'style' | 'pacing' | 'story' | 'tone';

function suggestion(type: SuggestionType, title: string, index: number) {
  return {
    type,
    severity: type === 'grammar' ? 'warning' : 'info',
    title,
    description: `Detailed feedback ${index} for the current passage. `.repeat(3),
    original: type === 'story' || type === 'pacing' ? null : `original phrase ${index}`,
    alternatives: type === 'story' || type === 'pacing' ? [`Consider story option ${index}`] : [`replacement phrase ${index}`],
  };
}

const firstBatch = [
  ...Array.from({ length: 4 }, (_, index) => suggestion('grammar', `Grammar suggestion ${index + 1}`, index)),
  ...Array.from({ length: 12 }, (_, index) => suggestion(index % 2 ? 'style' : 'vocabulary', `Review suggestion ${index + 1}`, index + 10)),
  ...Array.from({ length: 4 }, (_, index) => suggestion(index % 2 ? 'story' : 'pacing', `Story suggestion ${index + 1}`, index + 30)),
];

async function dismissTutorial(page: Page) {
  const card = page.getByTestId('tutorial-card');
  if (await card.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const skip = page.getByTestId('tutorial-skip');
    if (await skip.isVisible({ timeout: 500 }).catch(() => false)) await skip.click();
  }
}

async function ensureDocument(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await dismissTutorial(page);
  const create = page.getByTestId('btn-create-first');
  if (await create.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await create.click();
    await expect(page.getByTestId('save-status')).toBeVisible({ timeout: 8_000 });
  }
}

test('suggestions remain stable until the writer chooses the latest analysis', async ({ page, isMobile }) => {
  test.setTimeout(45_000);
  let requestCount = 0;

  await page.route('**/api/suggestions', async (route) => {
    requestCount += 1;
    if (requestCount === 2) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({ json: { suggestions: [suggestion('style', 'Stale review suggestion', 90)] } });
      return;
    }
    if (requestCount >= 3) {
      await route.fulfill({
        json: {
          suggestions: [
            suggestion('grammar', 'Latest grammar suggestion', 100),
            suggestion('style', 'Latest review suggestion', 101),
            suggestion('story', 'Latest story suggestion', 102),
          ],
        },
      });
      return;
    }
    await route.fulfill({ json: { suggestions: firstBatch } });
  });

  await ensureDocument(page);
  const editor = page.getByTestId('editor-area');
  const firstRequest = page.waitForRequest('**/api/suggestions');
  await editor.fill('This is the first sufficiently long passage used to request a complete set of writing suggestions.');
  await firstRequest;

  if (isMobile) {
    await page.getByTestId('btn-open-suggestions-sheet').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  }

  await expect(page.getByText('Grammar suggestion 1')).toBeVisible({ timeout: 8_000 });

  const grammarTab = page.getByTestId('tab-grammar');
  await grammarTab.focus();
  await page.keyboard.press('ArrowRight');
  const reviewTab = page.getByTestId('tab-review');
  await expect(reviewTab).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('Review suggestion 1', { exact: true })).toBeVisible();

  const scrollArea = page.getByTestId('suggestions-scroll');
  const didScroll = await scrollArea.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop > 0;
  });
  expect(didScroll).toBe(true);

  const secondRequest = page.waitForRequest('**/api/suggestions');
  const replaceEditorContent = async (text: string) => {
    if (!isMobile) {
      await editor.fill(text);
      return;
    }
    await editor.evaluate((element, nextText) => {
      element.innerHTML = nextText;
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: nextText,
      }));
    }, text);
  };
  await replaceEditorContent('This second sufficiently long passage starts an analysis that will become stale before it completes.');
  await secondRequest;
  await replaceEditorContent('This third sufficiently long passage is the newest text and must be the only analysis offered to the writer.');

  await page.waitForTimeout(800);
  await expect(page.getByTestId('btn-show-latest-suggestions')).not.toBeVisible();
  await expect(page.getByText('Review suggestion 1', { exact: true })).toBeVisible();
  await expect(reviewTab).toHaveAttribute('data-state', 'active');

  await expect(page.getByTestId('btn-show-latest-suggestions')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('Review suggestion 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Latest review suggestion')).not.toBeVisible();
  await expect(reviewTab).toHaveAttribute('data-state', 'active');

  await page.getByTestId('btn-show-latest-suggestions').click();
  await expect(page.getByText('Latest review suggestion')).toBeVisible();
  await expect(page.getByText('Review suggestion 1', { exact: true })).not.toBeVisible();
  await expect(page.getByText('Stale review suggestion')).not.toBeVisible();
  await expect(reviewTab).toHaveAttribute('data-state', 'active');
});