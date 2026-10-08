import { test, expect } from '@playwright/test';

test('Coach retains completed replies and drafts without replay across plans, documents, accounts and reset', async ({ page }) => {
  test.setTimeout(90_000);
  const now = new Date().toISOString();
  const accounts = ['history-account-a', 'history-account-b'];
  let account = accounts[0];
  const documents = [91001, 91002].map(id => ({
    id, title: `History document ${id}`, content: 'Some writing.', documentType: 'fiction',
    createdAt: now, updatedAt: now,
  }));
  // All writing and Coach endpoints are mocked: this test never spends real AI
  // queries or modifies documents belonging to the shared E2E account.
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    id: account, username: account, createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
  } }));
  await page.route('**/api/documents', route => route.fulfill({ json: documents }));
  await page.route(/\/api\/documents\/9100[12]$/, route =>
    route.fulfill({ json: documents.find(doc => route.request().url().endsWith(String(doc.id))) }));
  await page.route(/\/api\/documents\/9100[12]\/chapters$/, route => {
    const id = Number(route.request().url().match(/documents\/(\d+)/)?.[1]);
    return route.fulfill({ json: [{ id: id + 100, documentId: id, title: 'Chapter 1', content: 'Some writing.', position: 0, createdAt: now, updatedAt: now }] });
  });
  await page.route(/\/api\/chapters\/9110[12]$/, route => route.fulfill({ json: {
    id: Number(route.request().url().split('/').pop()), ...route.request().postDataJSON(), updatedAt: now,
  } }));
  await page.addInitScript(() => {
    localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
  });
  let requests = 0;
  let outcome: 'success' | 'incomplete' | 'pending' = 'success';
  let releasePending: (() => void) | undefined;
  await page.route('**/api/coach', async route => {
    requests++;
    const kind = outcome;
    if (kind === 'pending') await new Promise<void>(resolve => { releasePending = resolve; });
    const body = `data: {"content":"Retained completed answer."}\n\n`
      + (kind === 'incomplete' ? '' : 'data: {"done":true}\n\ndata: {"done":true}\n\n');
    try { await route.fulfill({ contentType: 'text/event-stream', body }); } catch { /* Navigation cancelled this request. */ }
  });
  const openCoach = async () => {
    if ((page.viewportSize()?.width ?? 1600) < 1440) {
      await page.getByTestId('btn-open-suggestions-sheet').click();
    }
    await page.getByTestId('tab-coach').click();
  };
  const closeSheet = async () => {
    if ((page.viewportSize()?.width ?? 1600) < 1440) {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('tab-coach')).not.toBeVisible();
    }
  };
  const selectDocument = async (id: number) => {
    await closeSheet();
    await page.getByTestId('toggle-doc-list').click();
    await page.getByTestId(`doc-item-${id}`).click();
    await expect(page.getByTestId('input-title')).toHaveValue(`History document ${id}`);
    await openCoach();
  };
  const setUsed = async (used: number) => {
    await page.evaluate(({ id, used }) => {
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`, JSON.stringify({ date, used }));
      window.dispatchEvent(new CustomEvent('lumina:ai-query-state-changed', { detail: { accountId: id } }));
    }, { id: account, used });
  };
  const balance = () => page.evaluate(id => {
    return JSON.parse(localStorage.getItem(`lumina_ai_daily_queries:${encodeURIComponent(id)}`) ?? '{"used":0}').used;
  }, account);

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await selectDocument(91002); // Deliberately not the default first document.
  await page.getByTestId('textarea-coach-input').fill('Remember this completed question');
  await page.getByTestId('btn-coach-send').click();
  await expect(page.getByTestId('btn-coach-insert-1')).toBeVisible();
  expect(await balance()).toBe(1); // Duplicate done events only count once.
  await page.getByTestId('textarea-coach-input').fill('Unsent draft');
  await setUsed(5);
  await expect(page.getByTestId('link-upgrade-from-coach')).toBeVisible();
  await page.getByTestId('link-upgrade-from-coach').click();
  await expect(page.getByTestId('upgrade-page')).toBeVisible();
  await page.reload();
  await page.getByTestId('link-back-to-writing').click();
  await expect(page.getByTestId('input-title')).toHaveValue('History document 91002');
  await openCoach();
  await expect(page.getByTestId('coach-message-list')).toContainText('Retained completed answer.');
  await expect(page.getByTestId('textarea-coach-input')).toHaveValue('Unsent draft');
  expect(requests).toBe(1);
  expect(await balance()).toBe(5);

  await selectDocument(91001);
  await expect(page.getByTestId('coach-message-list')).toHaveCount(0);
  await expect(page.getByTestId('textarea-coach-input')).toHaveValue('');
  await selectDocument(91002);
  await expect(page.getByTestId('textarea-coach-input')).toHaveValue('Unsent draft');
  await page.reload();
  await expect(page.getByTestId('input-title')).toHaveValue('History document 91002');
  await openCoach();
  await expect(page.getByTestId('coach-message-list')).toContainText('Remember this completed question');
  expect(requests).toBe(1);

  account = accounts[1];
  await page.reload();
  await expect(page.getByTestId('input-title')).toHaveValue('History document 91001');
  await selectDocument(91002);
  await expect(page.getByTestId('coach-message-list')).toHaveCount(0);
  await expect(page.getByTestId('textarea-coach-input')).toHaveValue('');
  account = accounts[0];
  await page.reload();
  await expect(page.getByTestId('input-title')).toHaveValue('History document 91002');
  await openCoach();
  await expect(page.getByTestId('textarea-coach-input')).toHaveValue('Unsent draft');

  await setUsed(1);
  await expect(page.getByTestId('textarea-coach-input')).toBeEnabled();
  outcome = 'incomplete';
  await page.getByTestId('btn-coach-send').click();
  await expect(page.getByTestId('ai-query-status-message')).toContainText('did not complete');
  await expect(page.getByTestId('textarea-coach-input')).toHaveValue('Unsent draft');
  expect(await balance()).toBe(1);
  await expect(page.getByTestId('coach-message-list')).not.toContainText('Unsent draft');

  outcome = 'pending';
  await page.getByTestId('textarea-coach-input').fill('Interrupted prompt');
  await page.getByTestId('btn-coach-send').click();
  await expect.poll(() => requests).toBe(3);
  await closeSheet(); // Mobile closing also cancels the pending stream.
  await page.getByTestId('btn-user-menu').click();
  await page.getByRole('menuitem', { name: 'Free & Premium plans' }).click();
  await expect(page.getByTestId('upgrade-page')).toBeVisible();
  releasePending?.(); // Even a late completion must not persist or charge.
  await page.getByTestId('link-back-to-writing').click();
  await expect(page.getByTestId('input-title')).toHaveValue('History document 91002');
  await openCoach();
  await expect(page.getByTestId('textarea-coach-input')).toHaveValue('Interrupted prompt');
  await expect(page.getByTestId('coach-message-list')).not.toContainText('Interrupted prompt');
  expect(await balance()).toBe(1);
  expect(requests).toBe(3);

  await page.getByTestId('btn-coach-reset').click();
  await expect(page.getByTestId('coach-message-list')).toHaveCount(0);
  await expect(page.getByTestId('textarea-coach-input')).toHaveValue('');
  await page.reload();
  await openCoach();
  await expect(page.getByTestId('coach-message-list')).toHaveCount(0);
  await expect(page.getByTestId('textarea-coach-input')).toHaveValue('');
  expect(requests).toBe(3);
});
