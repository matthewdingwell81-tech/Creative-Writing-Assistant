import { test, expect } from '@playwright/test';

test('Coach applies free limits, preserves rewards in trial, and links to protected plans', async ({ page }) => {
  test.setTimeout(90_000);
  const response = await page.request.get('/api/auth/me');
  expect(response.ok()).toBe(true);
  const user = await response.json();
  expect(Number.isFinite(Date.parse(user.createdAt))).toBe(true);
  let signupDate = new Date(Date.now() - 8 * 86400000).toISOString();
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ...user, createdAt: signupDate } }));
  await page.addInitScript((id: string) => {
    if (sessionStorage.getItem('freemium-seeded')) return;
    sessionStorage.setItem('freemium-seeded', 'true');
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`, JSON.stringify({ date, used: 4 }));
    localStorage.setItem(`lumina_admob_bonus_queries:${encodeURIComponent(id)}`, '2');
    localStorage.removeItem(`lumina_admob_premium:${encodeURIComponent(id)}`);
    localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
  }, user.id);
  const openCoach = async () => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    if ((page.viewportSize()?.width ?? 1600) < 1440) {
      await expect(page.getByTestId('btn-open-suggestions-sheet')).toBeVisible();
      await page.getByTestId('btn-open-suggestions-sheet').click();
    }
    await page.getByTestId('tab-coach').click();
  };
  let outcome: 'success' | 'failed' | 'empty' | 'incomplete' = 'success';
  let requests = 0;
  await page.route('**/api/coach', route => {
    requests++;
    if (outcome === 'failed') return route.fulfill({ status: 500, body: 'Failed' });
    const parts = outcome === 'empty' ? [] : [`data: ${JSON.stringify({ content: 'Successful reply.' })}\n\n`];
    if (outcome !== 'incomplete') parts.push('data: {"done":true}\n\ndata: {"done":true}\n\n');
    return route.fulfill({ contentType: 'text/event-stream', body: parts.join('') });
  });
  const send = async (text: string) => {
    await page.getByTestId('textarea-coach-input').fill(text);
    await page.getByTestId('btn-coach-send').click();
    await expect(page.getByTestId('textarea-coach-input')).toBeEnabled();
  };
  await openCoach();
  await expect(page.getByTestId('ai-query-balance')).toContainText('1 of 5');
  await send('Use daily query first');
  await expect(page.getByTestId('ai-query-balance')).toContainText('0 of 5');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('2 bonus');
  for (const kind of ['failed', 'empty', 'incomplete'] as const) {
    outcome = kind;
    await send(`Do not count ${kind}`);
    await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('2 bonus');
  }
  outcome = 'success';
  await send('Use first bonus');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('1 bonus');
  await page.getByTestId('textarea-coach-input').fill('Use final bonus');
  await page.getByTestId('btn-coach-send').click();
  await expect(page.getByTestId('ai-query-limit-prompt')).toBeVisible();
  await expect(page.getByTestId('textarea-coach-input')).toBeDisabled();
  const before = requests;
  await page.getByTestId('link-upgrade-from-coach').click();
  await expect(page.getByTestId('upgrade-page')).toBeVisible();
  await expect(page.getByTestId('premium-coming-soon')).toHaveText('Coming Soon');
  expect(requests).toBe(before);
  await page.reload();
  await expect(page.getByTestId('upgrade-page')).toBeVisible();

  await page.evaluate((id: string) => {
    localStorage.setItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`, JSON.stringify({ date: '2000-01-01', used: 5 }));
    localStorage.setItem(`lumina_admob_bonus_queries:${encodeURIComponent(id)}`, '2');
  }, user.id);
  await openCoach();
  await expect(page.getByTestId('ai-query-balance')).toContainText('5 of 5');
  signupDate = new Date(Date.now() - 86400000).toISOString();
  await openCoach();
  await expect(page.getByTestId('ai-query-balance')).toContainText('Free trial · unlimited');
  await send('Trial reply');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('2 bonus');

  await page.evaluate((id: string) => localStorage.setItem(`lumina_admob_premium:${encodeURIComponent(id)}`, 'true'), user.id);
  await openCoach();
  await expect(page.getByTestId('ai-query-balance')).toContainText('Premium · unlimited');
  await expect(page.getByTestId('ad-rewards-panel')).toHaveCount(0);
  await send('Premium reply');
  expect(await page.evaluate((id: string) => localStorage.getItem(`lumina_admob_bonus_queries:${encodeURIComponent(id)}`), user.id)).toBe('2');
});

test('plans redirect unauthenticated visitors to sign in', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.LUMINA_TEST_URL ?? 'http://localhost:80',
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto('/upgrade');
  await expect(page).toHaveURL(/\/auth$/);
  await context.close();
});
