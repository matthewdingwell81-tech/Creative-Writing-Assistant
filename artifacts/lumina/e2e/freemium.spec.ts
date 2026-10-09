import { test, expect } from '@playwright/test';
import { registerTestAccount } from './helpers/test-account';

test('Coach applies free limits, preserves rewards in trial, and links to protected plans', async ({ page }) => {
  test.setTimeout(90_000);
  // Both viewport projects mutate history. Give each its own account/document
  // instead of racing resets and writes on the shared writing account.
  const user = await registerTestAccount(page, 'freemium_coach');
  const documentResponse = await page.request.post('/api/documents', {
    data: { title: 'Freemium Coach test', content: '', documentType: 'fiction' },
  });
  expect(documentResponse.ok()).toBe(true);
  const document = await documentResponse.json();
  const chapterResponse = await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: 'Chapter 1', content: '', position: 0 },
  });
  expect(chapterResponse.ok()).toBe(true);
  try {
  expect(Number.isFinite(Date.parse(user.createdAt))).toBe(true);
  let signupDate = new Date(Date.now() - 8 * 86400000).toISOString();
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ...user, createdAt: signupDate } }));
  await page.addInitScript((id: string) => {
    if (sessionStorage.getItem('freemium-seeded')) return;
    sessionStorage.setItem('freemium-seeded', 'true');
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`, JSON.stringify({ date, used: 4 }));
    localStorage.setItem(`lumina_admob_bonus_queries:${encodeURIComponent(id)}`, '5');
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
    await expect(page.getByTestId('coach-sync-status')).toHaveCount(0);
  };
  await openCoach();
  await expect(page.getByTestId('ai-query-balance')).toContainText('1/5 daily queries remaining (+5 bonus)');
  await send('Use daily query first');
  await expect(page.getByTestId('ai-query-balance')).toContainText('0/5');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('5 bonus');
  let expectedBonus = 5;
  for (const kind of ['failed', 'empty', 'incomplete'] as const) {
    outcome = kind;
    await send(`Charge ${kind} attempt`);
    await expect(page.getByTestId('bonus-ai-query-balance')).toContainText(`${--expectedBonus} bonus`);
    await expect(page.getByTestId('ai-query-status-message')).toContainText('this request used one query');
  }
  outcome = 'success';
  await send('Use first bonus');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('1 bonus');
  await page.getByTestId('textarea-coach-input').fill('Use final bonus');
  await page.getByTestId('btn-coach-send').click();
  await expect(page.getByTestId('ai-query-limit-prompt')).toBeVisible();
  await expect(page.getByTestId('textarea-coach-input')).toBeDisabled();
  await expect(page.getByTestId('coach-sync-status')).toHaveCount(0);
  const before = requests;
  await expect(page.getByRole('dialog', { name: 'Upgrade to Premium' })).toBeVisible();
  await expect(page.getByTestId('upgrade-modal')).toContainText('Unlimited AI queries');
  await expect(page.getByTestId('upgrade-modal')).toContainText('No ads');
  await expect(page.getByTestId('upgrade-modal')).toContainText('Web portal access');
  await page.getByTestId('btn-upgrade-now').click();
  await expect(page.getByTestId('upgrade-page')).toBeVisible();
  await expect(page.getByTestId('premium-coming-soon')).toHaveText('Coming Soon');
  expect(requests).toBe(before);
  await page.reload();
  await expect(page.getByTestId('upgrade-page')).toBeVisible();
  await page.getByTestId('link-back-to-writing').click();
  await page.waitForLoadState('networkidle');
  if ((page.viewportSize()?.width ?? 1600) < 1440) {
    await page.getByTestId('btn-open-suggestions-sheet').click();
  }
  await page.getByTestId('tab-coach').click();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.getByTestId('coach-message-list')).toContainText('Use final bonus');
  await expect(page.getByTestId('coach-message-list')).toContainText('Successful reply.');
  await expect(page.getByTestId('coach-message-list')).not.toContainText('Charge ');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('0 bonus');
  expect(requests).toBe(before);
  await page.reload();
  await page.waitForLoadState('networkidle');
  if ((page.viewportSize()?.width ?? 1600) < 1440) {
    await page.getByTestId('btn-open-suggestions-sheet').click();
  }
  await page.getByTestId('tab-coach').click();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.getByTestId('coach-message-list')).toContainText('Use final bonus');
  expect(requests).toBe(before);
  await page.getByTestId('btn-coach-reset').click();
  await expect(page.getByTestId('coach-message-list')).toHaveCount(0);
  await openCoach();
  await expect(page.getByTestId('coach-message-list')).toHaveCount(0);

  await page.evaluate((id: string) => {
    localStorage.setItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`, JSON.stringify({ date: '2000-01-01', used: 5 }));
    localStorage.setItem(`lumina_admob_bonus_queries:${encodeURIComponent(id)}`, '2');
  }, user.id);
  await openCoach();
  await expect(page.getByTestId('ai-query-balance')).toContainText('5/5');
  signupDate = new Date(Date.now() - 86400000).toISOString();
  await openCoach();
  await expect(page.getByTestId('ai-query-balance')).toContainText('Free trial · unlimited');
  await send('Trial reply');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('2 bonus');

  await page.evaluate(async () => {
    const tier = await import(new URL('src/lib/userTier.ts', document.baseURI).href);
    await tier.setTier('premium');
    if (!tier.isPremium() || await tier.isFirebaseLoggedIn()) throw new Error('Local account tier helper failed');
  });
  await openCoach();
  await expect(page.getByTestId('ai-query-balance')).toContainText('Premium · unlimited');
  await expect(page.getByTestId('ad-rewards-panel')).toHaveCount(0);
  await send('Premium reply');
  expect(await page.evaluate((id: string) => localStorage.getItem(`lumina_admob_bonus_queries:${encodeURIComponent(id)}`), user.id)).toBe('2');
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
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
