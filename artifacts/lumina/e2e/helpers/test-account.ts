import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

/** Registration sets this page context's session without touching the shared E2E session. */
export async function registerTestAccount(page: Page, prefix: string) {
  // Auth endpoints update the current server session. Never register while
  // holding the shared storage-state cookie, or other tests inherit this user.
  await page.context().clearCookies();
  const response = await page.request.post('/api/auth/register', {
    data: { username: `${prefix}_${randomUUID().slice(0, 12)}`, password: randomUUID() },
  });
  expect(response.status(), `Could not create isolated ${prefix} test account`).toBe(201);
  return response.json() as Promise<{ id: string; username: string; createdAt: string }>;
}
