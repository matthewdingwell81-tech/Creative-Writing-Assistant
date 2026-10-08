import { test, expect } from '@playwright/test';

test('Coach ad rewards persist per account and stay hidden for premium users', async ({ page }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const title = `Ad rewards test ${suffix}`;
  const userResponse = await page.request.get('/api/auth/me');
  expect(userResponse.ok()).toBe(true);
  const user = await userResponse.json();

  const createDocumentResponse = await page.request.post('/api/documents', {
    data: { title, content: '', documentType: 'fiction' },
  });
  expect(createDocumentResponse.ok()).toBe(true);
  const document = await createDocumentResponse.json();

  const createChapterResponse = await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: 'Chapter 1', content: '', position: 0 },
  });
  expect(createChapterResponse.ok()).toBe(true);

  const openDocumentAndCoach = async () => {
    await page.getByTestId('toggle-doc-list').click();
    await expect(page.getByTestId(`doc-item-${document.id}`)).toBeVisible();
    const chapterLoad = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/chapters`) &&
      response.request().method() === 'GET' &&
      response.ok()
    );
    await page.getByTestId(`doc-item-${document.id}`).click();
    await chapterLoad;
    await expect(page.getByTestId('input-title')).toHaveValue(title);

    if (testInfo.project.name.endsWith('mobile')) {
      await page.getByTestId('btn-open-suggestions-sheet').click();
    }
    await page.getByTestId('tab-coach').click();
  };

  try {
    await page.addInitScript((accountId: string) => {
      localStorage.setItem(
        `lumina_admob_bonus_queries:${encodeURIComponent(accountId)}`,
        '3',
      );
      localStorage.removeItem(`lumina_admob_premium:${encodeURIComponent(accountId)}`);
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    }, user.id);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openDocumentAndCoach();

    const adPanel = page.getByTestId('ad-rewards-panel');
    await expect(adPanel).toBeVisible();
    await expect(page.getByTestId('bonus-ai-query-balance')).toHaveText('3 bonus AI queries available');
    await expect(page.getByTestId('btn-watch-ad-for-ai-queries')).toBeVisible();
    await expect(page.getByTestId('btn-watch-ad-for-ai-queries')).toBeDisabled();
    await expect(adPanel).toContainText('available in the native Android app');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await openDocumentAndCoach();
    await expect(page.getByTestId('bonus-ai-query-balance')).toHaveText('3 bonus AI queries available');

    await page.evaluate((accountId: string) => {
      localStorage.setItem(`lumina_admob_premium:${encodeURIComponent(accountId)}`, 'true');
    }, user.id);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openDocumentAndCoach();
    await expect(page.getByTestId('ad-rewards-panel')).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});
