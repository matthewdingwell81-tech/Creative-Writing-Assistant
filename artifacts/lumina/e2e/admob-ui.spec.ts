import { test, expect } from '@playwright/test';

test('reward UI grants once, handles skipped/failed videos, and temporarily dismisses banners', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  // Other regression projects delete their documents while running in parallel.
  // A dedicated test account keeps this navigation/save check independent.
  const signup = await page.request.post('/api/auth/register', {
    data: {
      username: `reward_ui_${testInfo.project.name.replace(/-/g, '_')}_${Date.now()}`,
      password: 'RewardUiTest-2026!',
    },
  });
  expect(signup.status()).toBe(201);
  const user = await signup.json();
  const documentResponse = await page.request.post('/api/documents', {
    data: { title: 'Reward UI verification', content: '', documentType: 'fiction' },
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
  // Simulate the native bridge, not a production fallback or a real ad request.
  await page.addInitScript((id: string) => {
    const w = window as any;
    const callbacks = new Map<string, { event: string; callback: (data: unknown) => void }>();
    let nextId = 0;
    w.adUiTest = { outcome: 'reward', calls: [] as string[] };
    const emit = (event: string, data: unknown = {}) => {
      callbacks.forEach(value => { if (value.event === event) value.callback(data); });
    };
    w.CapacitorCustomPlatform = { name: 'android' };
    const methods = ['requestConsentInfo', 'initialize', 'showBanner', 'removeBanner', 'prepareRewardVideoAd', 'showRewardVideoAd', 'removeListener'];
    w.Capacitor = {
      PluginHeaders: [{
        name: 'AdMob',
        methods: [...methods.map(name => ({ name, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }],
      }],
      nativeCallback: (_plugin: string, _method: string, options: { eventName: string }, callback: (data: unknown) => void) => {
        const callbackId = String(++nextId);
        callbacks.set(callbackId, { event: options.eventName, callback });
        return callbackId;
      },
      nativePromise: async (_plugin: string, method: string, options: any) => {
        w.adUiTest.calls.push(method);
        if (method === 'requestConsentInfo') return { canRequestAds: true, status: 'OBTAINED' };
        if (method === 'removeListener') callbacks.delete(options.callbackId);
        if (method === 'showBanner') emit('bannerAdSizeChanged', { height: 50 });
        if (method === 'prepareRewardVideoAd' && w.adUiTest.outcome === 'error') throw new Error('Test ad load failure');
        if (method === 'showRewardVideoAd') {
          if (w.adUiTest.outcome === 'skip') {
            emit('onRewardedVideoAdDismissed');
            return new Promise(() => {});
          }
          emit('onRewardedVideoAdReward', { amount: 1 });
          emit('onRewardedVideoAdReward', { amount: 1 });
          return { amount: 1 };
        }
        return {};
      },
    };
    if (!sessionStorage.getItem('ad-ui-seeded')) {
      sessionStorage.setItem('ad-ui-seeded', 'true');
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`, JSON.stringify({ date, used: 5 }));
      localStorage.setItem(`lumina_admob_bonus_queries:${encodeURIComponent(id)}`, '0');
      localStorage.removeItem(`lumina_admob_premium:${encodeURIComponent(id)}`);
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    }
  }, user.id);
  await page.goto('/');
  await expect(page.getByTestId('banner-ad-controls')).toBeVisible();
  const mobile = (page.viewportSize()?.width ?? 1600) < 1440;
  if (mobile) await page.getByTestId('btn-open-suggestions-sheet').click();
  await page.getByTestId('tab-coach').click();
  await expect(page.getByTestId('upgrade-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.getByTestId('btn-coach-send')).toBeDisabled();
  await expect(page.getByTestId('ai-query-limit-prompt')).toBeVisible();
  const reward = page.getByTestId('btn-watch-ad-for-ai-queries');
  await expect(reward).toHaveText('Get Bonus AI Queries 📺');
  const inputBox = await page.getByTestId('textarea-coach-input').boundingBox();
  const rewardBox = await reward.boundingBox();
  expect(rewardBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height);
  await reward.click();
  await expect(page.getByTestId('ad-reward-message')).toHaveText('You earned +2 bonus queries!');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('2 bonus');
  await expect(page.getByTestId('ai-query-balance')).toHaveText('0/5 daily queries remaining (+2 bonus)');
  await expect(page.getByTestId('textarea-coach-input')).toBeEnabled();
  expect(await page.evaluate(() => (window as any).adUiTest.calls.filter((call: string) => call === 'showRewardVideoAd').length)).toBe(1);
  await page.evaluate(() => { (window as any).adUiTest.outcome = 'skip'; });
  await reward.click();
  await expect(page.getByTestId('ad-reward-message')).toContainText('not completed');
  await expect(reward).toBeEnabled();
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('2 bonus');
  await page.evaluate(() => { (window as any).adUiTest.outcome = 'error'; });
  await reward.click();
  await expect(page.getByTestId('ad-reward-message')).toContainText('could not load');
  await expect(page.getByTestId('bonus-ai-query-balance')).toContainText('2 bonus');
  if (mobile) await page.getByRole('dialog', { name: 'Creative Assistant' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('btn-dismiss-banner-ad').click();
  await expect(page.getByTestId('banner-ad-controls')).toHaveCount(0);
  await page.getByTestId('btn-user-menu').click();
  await page.getByTestId(mobile ? 'btn-mobile-upgrade' : 'btn-upgrade').click();
  await expect(page.getByTestId('upgrade-page')).toBeVisible();
  await page.getByTestId('link-back-to-writing').click();
  await expect(page.getByTestId('banner-ad-controls')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('banner-ad-controls')).toBeVisible();
  await page.evaluate((id: string) => localStorage.setItem(`lumina_admob_premium:${encodeURIComponent(id)}`, 'true'), user.id);
  await page.reload();
  await expect(page.getByTestId('btn-user-menu')).toBeVisible();
  await expect(page.getByTestId('banner-ad-controls')).toHaveCount(0);
  if (mobile) await page.getByTestId('btn-open-suggestions-sheet').click();
  await page.getByTestId('tab-coach').click();
  await expect(page.getByTestId('ad-rewards-panel')).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});
