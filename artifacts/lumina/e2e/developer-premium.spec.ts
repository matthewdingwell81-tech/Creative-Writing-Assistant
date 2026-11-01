import { test, expect } from '@playwright/test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { SubscriptionState } from '@workspace/api-client-react';

const developer = {
  id: 'developer-account',
  email: 'developer@example.test',
  username: 'Developer',
  createdAt: '2020-01-01T00:00:00.000Z',
  firebaseUid: 'b609ec1f-1c63-49e7-8f84-2cee1ab6f311',
  premium: true,
};
const unrelated = {
  id: 'unrelated-account',
  email: 'writer@example.test',
  username: 'Writer',
  createdAt: '2024-01-01T00:00:00.000Z',
  firebaseUid: 'unrelated-google-uid',
  premium: null,
};

test('Android-sized sign-in exchange, reload, and account switching preserve the correct tier', async ({ page }) => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const receiptPublicKey = await exportJWK(publicKey);
  let activeAccount: typeof developer | typeof unrelated | null = null;
  let observedFirebaseToken: string | undefined;

  await page.route('**/api/auth/me', async route => {
    if (!activeAccount) {
      await route.fulfill({ status: 401, json: { error: 'Not authenticated' } });
      return;
    }
    await route.fulfill({ json: activeAccount });
  });
  await page.route('**/api/auth/firebase-session', async route => {
    observedFirebaseToken = route.request().headers().authorization?.replace(/^Bearer /, '');
    activeAccount = observedFirebaseToken === 'verified-developer-fixture'
      ? developer
      : observedFirebaseToken === 'verified-unrelated-fixture' ? unrelated : null;
    if (!activeAccount) {
      await route.fulfill({ status: 401, json: { error: 'Invalid or expired Firebase sign-in' } });
      return;
    }
    await route.fulfill({ json: activeAccount });
  });
  await page.route('**/api/billing/config', route => route.fulfill({ json: {
    androidApiKey: 'goog_isolated_e2e_fixture',
    entitlementIdentifier: 'premium',
    managementUrl: 'https://play.google.com/store/account/subscriptions',
    receiptPublicKey,
  } }));
  await page.route('**/api/billing/subscription', async route => {
    if (!activeAccount) {
      await route.fulfill({ status: 401, json: { error: 'Sign in required.' } });
      return;
    }
    const verifiedAt = Date.now();
    const tier = activeAccount.id === developer.id ? 'premium' : 'free';
    const subscription: SubscriptionState = {
      accountId: activeAccount.id,
      tier,
      status: tier === 'premium' ? 'active' : 'none',
      expiresAt: null,
      subscriptionId: null,
      verifiedAt,
      receipt: '',
      firebaseSync: 'not-linked',
    };
    const receipt = await new SignJWT({ subscription: { ...subscription, receipt: undefined, firebaseSync: undefined } })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(activeAccount.id)
      .setIssuer('lumina-billing')
      .setAudience('lumina-premium')
      .setIssuedAt()
      .setExpirationTime(Math.floor(verifiedAt / 1000) + 86400)
      .sign(privateKey);
    await route.fulfill({ json: { ...subscription, receipt } });
  });
  await page.route('**/api/tutorial-preferences', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/admin/safety-flags/count', route => route.fulfill({ json: { count: 0 } }));

  // Start unsigned, then exercise the explicit Firebase-to-Lumina session
  // exchange used after Google redirect completion. The API integration test
  // separately verifies the signed Firebase identity and real server routers.
  await page.goto('/auth');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  const developerExchange = await page.evaluate(async () => {
    const response = await fetch('/api/auth/firebase-session', {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: 'Bearer verified-developer-fixture' },
    });
    return { status: response.status, body: await response.json() };
  });
  expect(developerExchange.status).toBe(200);
  expect(developerExchange.body).toMatchObject({
    id: developer.id, firebaseUid: developer.firebaseUid, premium: true,
  });
  expect(observedFirebaseToken).toBe('verified-developer-fixture');

  await page.goto('/settings');
  await expect(page.getByTestId('text-plan-status')).toContainText('Premium (active)');
  await page.reload();
  await expect(page.getByTestId('text-plan-status')).toContainText('Premium (active)');
  expect(await page.evaluate(id =>
    localStorage.getItem(`lumina_admob_premium:${encodeURIComponent(id)}`), developer.id,
  )).toBe('premium');

  const unrelatedExchange = await page.evaluate(async () => {
    const response = await fetch('/api/auth/firebase-session', {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: 'Bearer verified-unrelated-fixture' },
    });
    return { status: response.status, body: await response.json() };
  });
  expect(unrelatedExchange.status).toBe(200);
  expect(unrelatedExchange.body).toMatchObject({
    id: unrelated.id, firebaseUid: unrelated.firebaseUid, premium: null,
  });
  expect(observedFirebaseToken).toBe('verified-unrelated-fixture');
  await page.reload();
  await expect(page.getByTestId('text-plan-status')).toContainText('Free');
  expect(await page.evaluate(id =>
    localStorage.getItem(`lumina_admob_premium:${encodeURIComponent(id)}`), unrelated.id,
  )).toBe('free');

  const switchedBack = await page.evaluate(async () => {
    const response = await fetch('/api/auth/firebase-session', {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: 'Bearer verified-developer-fixture' },
    });
    return response.status;
  });
  expect(switchedBack).toBe(200);
  await page.reload();
  await expect(page.getByTestId('text-plan-status')).toContainText('Premium (active)');
  expect(await page.evaluate(id =>
    localStorage.getItem(`lumina_admob_premium:${encodeURIComponent(id)}`), developer.id,
  )).toBe('premium');
});
