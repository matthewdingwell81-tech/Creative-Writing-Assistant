import { test, expect } from '@playwright/test';

test('Coach ad rewards persist per account and stay hidden for premium users', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
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
      (response.ok() || response.status() === 304)
    );
    await page.getByTestId(`doc-item-${document.id}`).click();
    await chapterLoad;
    await expect(page.getByTestId('input-title')).toHaveValue(title);

    if (await page.getByTestId('btn-open-suggestions-sheet').isVisible()) {
      await page.getByTestId('btn-open-suggestions-sheet').click();
    }
    await page.getByTestId('tab-coach').click();
  };

  try {
    await page.addInitScript(({ accountId, marker }) => {
      if (sessionStorage.getItem(marker)) return;
      sessionStorage.setItem(marker, 'true');
      localStorage.setItem(
        `lumina_admob_bonus_queries:${encodeURIComponent(accountId)}`,
        '3',
      );
      localStorage.removeItem(`lumina_admob_premium:${encodeURIComponent(accountId)}`);
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    }, { accountId: user.id as string, marker: `admob-test-${suffix}` });

    const successfulCoachReply = async () => {
      await page.unroute('**/api/coach');
      await page.route('**/api/coach', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: [
            `data: ${JSON.stringify({ content: 'A completed Coach reply.' })}`,
            '',
            `data: ${JSON.stringify({ done: true })}`,
            '',
            `data: ${JSON.stringify({ done: true })}`,
            '',
            '',
          ].join('\n'),
        });
      });
    };
    await successfulCoachReply();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openDocumentAndCoach();

    const adPanel = page.getByTestId('ad-rewards-panel');
    await expect(adPanel).toBeVisible();
    await expect(page.getByTestId('bonus-ai-query-balance')).toHaveText('3 bonus AI queries available');
    await expect(page.getByTestId('btn-watch-ad-for-ai-queries')).toBeVisible();
    await expect(page.getByTestId('btn-watch-ad-for-ai-queries')).toBeDisabled();
    await expect(adPanel).toContainText('available in the native Android app');

    await page.getByTestId('textarea-coach-input').fill('Use one bonus query');
    await page.getByTestId('btn-coach-send').click();
    await expect(page.getByTestId('bonus-ai-query-balance')).toHaveText('2 bonus AI queries available');

    await page.unroute('**/api/coach');
    await page.route('**/api/coach', route => route.fulfill({ status: 500, body: 'Failed' }));
    await page.getByTestId('textarea-coach-input').fill('This request will fail');
    await page.getByTestId('btn-coach-send').click();
    await expect(page.getByTestId('coach-message-list')).toContainText('Something went wrong.');
    await expect(page.getByTestId('bonus-ai-query-balance')).toHaveText('2 bonus AI queries available');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await openDocumentAndCoach();
    await expect(page.getByTestId('bonus-ai-query-balance')).toHaveText('2 bonus AI queries available');

    await successfulCoachReply();
    await page.evaluate((accountId: string) => {
      localStorage.setItem(`lumina_admob_premium:${encodeURIComponent(accountId)}`, 'true');
    }, user.id);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openDocumentAndCoach();
    await expect(page.getByTestId('ad-rewards-panel')).toHaveCount(0);
    await page.getByTestId('textarea-coach-input').fill('A premium request does not spend a bonus');
    await page.getByTestId('btn-coach-send').click();
    await expect(page.getByTestId('coach-message-list')).toContainText('A completed Coach reply.');
    expect(await page.evaluate((accountId: string) =>
      localStorage.getItem(`lumina_admob_bonus_queries:${encodeURIComponent(accountId)}`),
    user.id)).toBe('2');
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});
