import { test, expect } from '@playwright/test';

test('renames the active chapter from the chapter menu and persists it', async ({ page }, testInfo) => {
  test.setTimeout(60_000);

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const documentTitle = `Chapter rename test ${suffix}`;
  const originalTitle = `Original chapter ${suffix}`;
  const renamedTitle = `Renamed chapter ${suffix}`;
  const isMobile = testInfo.project.name.endsWith('mobile');

  const documentResponse = await page.request.post('/api/documents', {
    data: { title: documentTitle, content: '', documentType: 'fiction' },
  });
  expect(documentResponse.ok()).toBe(true);
  const document = await documentResponse.json();

  const chapterResponse = await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: originalTitle, content: '', position: 0 },
  });
  expect(chapterResponse.ok()).toBe(true);
  const chapter = await chapterResponse.json();

  const openRenameFromMenu = async () => {
    if (isMobile) {
      await page.getByTestId('btn-mobile-overflow').click();
      await page.getByTestId('mobile-rename-chapter').click();
    } else {
      await page.getByTestId('select-chapter').click();
      await page.getByTestId('desktop-rename-chapter').click();
    }
    await expect(page.getByTestId('rename-chapter-dialog')).toBeVisible();
  };

  const selectTestDocument = async () => {
    await page.getByTestId('toggle-doc-list').click();
    await expect(page.getByTestId(`doc-item-${document.id}`)).toBeVisible();
    const chaptersLoaded = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/chapters`) &&
      response.request().method() === 'GET' &&
      response.ok()
    );
    await page.getByTestId(`doc-item-${document.id}`).click();
    await chaptersLoaded;
    await expect(page.getByTestId('input-title')).toHaveValue(documentTitle);
  };

  try {
    await page.addInitScript(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });
    let failNextRename = true;
    await page.route(`**/api/chapters/${chapter.id}`, async route => {
      if (route.request().method() === 'PATCH' && failNextRename) {
        failNextRename = false;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporary save failure' }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await selectTestDocument();

    await openRenameFromMenu();
    await expect(page.getByTestId('input-chapter-title')).toHaveValue(originalTitle);
    await page.getByTestId('input-chapter-title').fill('Temporary title');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rename-chapter-dialog')).not.toBeVisible();

    await openRenameFromMenu();
    await expect(page.getByTestId('input-chapter-title')).toHaveValue(originalTitle);
    await page.getByTestId('input-chapter-title').fill('   ');
    await page.getByTestId('btn-save-chapter-title').click();
    await expect(page.getByTestId('rename-chapter-dialog')).toBeVisible();
    await expect(page.getByText('Chapter name required', { exact: true })).toBeVisible();

    await page.getByTestId('input-chapter-title').fill(renamedTitle);
    const failedSave = page.waitForResponse(response =>
      response.url().endsWith(`/api/chapters/${chapter.id}`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 500
    );
    await page.getByTestId('btn-save-chapter-title').click();
    await failedSave;
    await expect(page.getByTestId('rename-chapter-dialog')).toBeVisible();
    await expect(page.getByTestId('input-chapter-title')).toHaveValue(renamedTitle);
    await expect(page.getByText('Could not rename chapter', { exact: true })).toBeVisible();

    const persisted = page.waitForResponse(response =>
      response.url().endsWith(`/api/chapters/${chapter.id}`) &&
      response.request().method() === 'PATCH' &&
      response.ok()
    );
    await page.getByTestId('btn-save-chapter-title').click();
    await persisted;
    await expect(page.getByTestId('rename-chapter-dialog')).not.toBeVisible();

    if (isMobile) {
      await page.getByTestId('btn-mobile-overflow').click();
      await expect(page.getByTestId(`mobile-chapter-${chapter.id}`)).toContainText(renamedTitle);
    } else {
      await expect(page.getByTestId('select-chapter')).toContainText(renamedTitle);
    }

    await page.reload();
    await page.waitForLoadState('networkidle');
    await selectTestDocument();

    if (isMobile) {
      await page.getByTestId('btn-mobile-overflow').click();
      await expect(page.getByTestId(`mobile-chapter-${chapter.id}`)).toContainText(renamedTitle);
    } else {
      await expect(page.getByTestId('select-chapter')).toContainText(renamedTitle);
    }
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});