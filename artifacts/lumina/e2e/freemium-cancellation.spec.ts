import { test, expect } from '@playwright/test';
import { registerTestAccount } from './helpers/test-account';

test('resetting a pending Coach request keeps its pre-send charge without using a bonus', async ({ page }) => {
  const user = await registerTestAccount(page, 'cancelled_query');
  const documentResponse = await page.request.post('/api/documents', {
    data: { title: 'Cancelled Coach test', content: '', documentType: 'fiction' },
  });
  expect(documentResponse.ok()).toBe(true);
  const document = await documentResponse.json();
  try {
  const chapterResponse = await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: 'Chapter 1', content: '', position: 0 },
  });
  expect(chapterResponse.ok()).toBe(true);
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
  await expect(page.getByTestId('ai-query-balance')).toContainText('4/5');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('2 bonus');
  expect(await page.evaluate((id: string) =>
    JSON.parse(localStorage.getItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`)!).count, user.id)).toBe(1);
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});
