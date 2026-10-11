import type { Page } from '@playwright/test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

/**
 * Browser-only billing fixtures with an isolated signing key. Never changes a
 * real account's subscription, invokes checkout, or uses production credentials.
 */
export async function mockVerifiedBilling(page: Page, accountId: () => string) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const receiptPublicKey = await exportJWK(publicKey);
  let tier: 'free' | 'premium' = 'free';
  await page.route('**/api/billing/config', route => route.fulfill({ json: {
    androidApiKey: 'goog_browser_fixture', entitlementIdentifier: 'premium',
    managementUrl: 'https://play.google.com/store/account/subscriptions',
    receiptPublicKey,
  } }));
  await page.route('**/api/billing/subscription', async route => {
    const id = accountId();
    const verifiedAt = Date.now();
    const subscription = {
      accountId: id, tier, status: tier === 'premium' ? 'active' : 'none',
      expiresAt: tier === 'premium' ? verifiedAt + 86400000 : null,
      subscriptionId: null, verifiedAt,
    };
    const receipt = await new SignJWT({ subscription })
      .setProtectedHeader({ alg: 'EdDSA' }).setSubject(id)
      .setIssuer('lumina-billing').setAudience('lumina-premium')
      .setIssuedAt().setExpirationTime(Math.floor(verifiedAt / 1000) + 86400)
      .sign(privateKey);
    await route.fulfill({ json: { ...subscription, receipt, firebaseSync: 'not-linked' } });
  });
  return { setTier: (value: 'free' | 'premium') => { tier = value; } };
}
