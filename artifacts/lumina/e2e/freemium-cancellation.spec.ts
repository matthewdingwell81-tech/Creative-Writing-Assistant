import { test, expect } from '@playwright/test';

test('resetting a pending Coach request does not use daily or bonus queries', async ({ page }) => {
  const user = await (await page.request.get('/api/auth/me')).json();
  await page.route('**/api/auth/me', route => route.fulfill({
    json: { ...user, createdAt: new Date(Date.now() - 8 * 86400000).toISOString() },
  }));
  await page.addInitScript((id: string) => {
    localStorage.removeItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`);
    localStorage.removeItem(`lumina_admob_premium:${encodeURIComponent(id)}`);
    localStorage.setItem(`lumina_admob_bonus_queries:${encodeURIComponent(id)}`, '2');
    localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
  }, user.id);
  let release!: () => void;
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/coach', async route => {
    await responseGate;
    await route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"content":"Late response."}\n\ndata: {"done":true}\n\n',
    }).catch(() => {});
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  if ((page.viewportSize()?.width ?? 1600) < 1440) {
    await expect(page.getByTestId('btn-open-suggestions-sheet')).toBeVisible();
    await page.getByTestId('btn-open-suggestions-sheet').click();
  }
  await page.getByTestId('tab-coach').click();
  await page.getByTestId('textarea-coach-input').fill('Cancel this request');
  const request = page.waitForRequest('**/api/coach');
  await page.getByTestId('btn-coach-send').click();
  await request;
  await page.getByTestId('btn-coach-reset').click();
  release();
  await expect(page.getByTestId('ai-query-balance')).toContainText('5/5');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('2 bonus');
  expect(await page.evaluate((id: string) => localStorage.getItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`), user.id)).toBeNull();
});
