/**
 * Global auth setup.
 *
 * Registers (or logs in to) a dedicated E2E test account and saves the session
 * cookie to disk so that every subsequent test file can reuse the logged-in
 * state without going through the auth flow each time.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FILE = path.resolve(__dirname, '.auth/mobile.json');

const E2E_USER = 'e2e_mobile_test';
const E2E_PASS = 'e2e_mobile_pass_123!';

setup('authenticate test user', async ({ page }) => {
  await page.goto('/auth');

  // ── Try registering first ────────────────────────────────────────────────
  await page.getByTestId('tab-register').click();
  await page.getByTestId('input-username').fill(E2E_USER);
  await page.getByTestId('input-password').fill(E2E_PASS);
  await page.getByTestId('button-submit-auth').click();

  // Wait up to 4 s for either a redirect to "/" or an error message
  const registered = await Promise.race([
    page.waitForURL('/', { timeout: 4_000 }).then(() => true).catch(() => false),
    page.getByTestId('text-auth-error').waitFor({ timeout: 4_000 }).then(() => false).catch(() => false),
  ]);

  if (!registered) {
    // Username already taken — fall back to login
    await page.getByTestId('tab-login').click();
    await page.getByTestId('input-username').fill(E2E_USER);
    await page.getByTestId('input-password').fill(E2E_PASS);
    await page.getByTestId('button-submit-auth').click();
    await page.waitForURL('/', { timeout: 8_000 });
  }

  // Confirm we're on the home page
  await expect(page).toHaveURL('/');

  // Persist session cookies / localStorage so tests can skip auth
  await page.context().storageState({ path: AUTH_FILE });
});
