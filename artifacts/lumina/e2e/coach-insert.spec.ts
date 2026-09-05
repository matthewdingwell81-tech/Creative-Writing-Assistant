import { test, expect } from '@playwright/test';

test('Coach Insert preserves current text and persists the response', async ({ page }, testInfo) => {
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

    await page.getByTestId('toggle-doc-list').click();
    await expect(page.getByTestId(`doc-item-${document.id}`)).toBeVisible();
    const initialChapterLoad = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/chapters`) &&
      response.request().method() === 'GET' &&
      response.ok()
    );
    await page.getByTestId(`doc-item-${document.id}`).click();
    await initialChapterLoad;
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

    const persisted = page.waitForResponse(response =>
      response.url().endsWith(`/api/chapters/${chapter.id}`) &&
      response.request().method() === 'PATCH' &&
      response.ok()
    );
    await insertButton.click();
    await persisted;

    await expect(editor).toContainText(typedText);
    await expect(editor).toContainText(coachText);
    await expect(editor.locator('b')).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByTestId('toggle-doc-list').click();
    const reloadChapterLoad = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/chapters`) &&
      response.request().method() === 'GET' &&
      response.ok()
    );
    await page.getByTestId(`doc-item-${document.id}`).click();
    await reloadChapterLoad;

    await expect(page.getByTestId('editor-area')).toContainText(typedText);
    await expect(page.getByTestId('editor-area')).toContainText(coachText);
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});