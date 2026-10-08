import { test, expect } from '@playwright/test';
import { registerTestAccount } from './helpers/test-account';

test('Coach Insert preserves current text and persists the response', async ({ page }, testInfo) => {
  await registerTestAccount(page, 'coach_insert');
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const title = `Coach insert test ${suffix}`;
  const typedText = `Recent unsaved typing ${suffix}`;
  const coachText = `Saved coach response ${suffix} <b>as plain text</b>`;

  const createDocumentResponse = await page.request.post('/api/documents', {
    data: { title, content: '', documentType: 'fiction' },
  });
  expect(createDocumentResponse.ok()).toBe(true);
  const document = await createDocumentResponse.json();

  const createChapterResponse = await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: 'Chapter 1', content: '', position: 0 },
  });
  expect(createChapterResponse.ok()).toBe(true);
  const chapter = await createChapterResponse.json();

  try {
    await page.addInitScript(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });

    await page.route('**/api/coach', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          `data: ${JSON.stringify({ content: coachText })}`,
          '',
          `data: ${JSON.stringify({ done: true })}`,
          '',
          '',
        ].join('\n'),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // This isolated account has exactly one document; Home selects it directly.
    await expect(page.getByTestId('input-title')).toHaveValue(title);

    const editor = page.getByTestId('editor-area');
    await editor.fill(typedText);

    if (testInfo.project.name.endsWith('mobile')) {
      await page.getByTestId('btn-open-suggestions-sheet').click();
    }
    await page.getByTestId('tab-coach').click();
    await page.getByTestId('textarea-coach-input').fill('Write the next paragraph');
    await page.getByTestId('btn-coach-send').click();

    const insertButton = page.locator('[data-testid^="btn-coach-insert-"]').last();
    await expect(insertButton).toBeVisible();

    let saveRequestCount = 0;
    const isCoachSave = (request: import('@playwright/test').Request) =>
      request.url().endsWith(`/api/chapters/${chapter.id}`)
      && request.method() === 'PATCH'
      && String(request.postDataJSON()?.content).includes(`Saved coach response ${suffix}`);
    page.on('request', request => {
      // Ignore a queued autosave of the writer's text before Insert was clicked.
      if (isCoachSave(request)) {
        saveRequestCount += 1;
      }
    });
    const persisted = page.waitForResponse(response =>
      isCoachSave(response.request()) && response.ok()
    );
    await insertButton.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(insertButton).toBeDisabled();
    await persisted;
    await expect(insertButton).toHaveText('Inserted');
    expect(saveRequestCount).toBe(1);

    await expect(editor).toContainText(typedText);
    await expect(editor).toContainText(coachText);
    await expect(editor.locator('b')).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('input-title')).toHaveValue(title);

    await expect(page.getByTestId('editor-area')).toContainText(typedText);
    await expect(page.getByTestId('editor-area')).toContainText(coachText);
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});