import { test, expect, type Page } from '@playwright/test';

async function selectDocument(page: Page, documentId: number, title: string) {
  const currentTitle = await page.getByTestId('input-title').inputValue().catch(() => '');
  if (currentTitle === title) return;
  await page.getByTestId('toggle-doc-list').click();
  await expect(page.getByTestId(`doc-item-${documentId}`)).toBeVisible();
  const chaptersLoaded = page.waitForResponse(response =>
    response.url().endsWith(`/api/documents/${documentId}/chapters`) &&
    response.request().method() === 'GET' &&
    response.ok()
  );
  await page.getByTestId(`doc-item-${documentId}`).click();
  await chaptersLoaded;
  await expect(page.getByTestId('input-title')).toHaveValue(title);
}

async function openBoard(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByTestId('btn-mobile-overflow').click();
    await page.getByTestId('mobile-view-board').click();
  } else {
    await page.getByTestId('button-view-board').click();
  }
  await expect(page.getByTestId('board')).toBeVisible();
}

async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  cancel = false
) {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, id: 1 }],
  });
  await page.waitForTimeout(30);
  for (let step = 1; step <= 8; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: from.x + ((to.x - from.x) * step) / 8,
        y: from.y + ((to.y - from.y) * step) / 8,
        id: 1,
      }],
    });
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(80);
  await session.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  });
  await session.detach();
}

test('supports the complete Story Board workflow and persists changes', async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const isMobile = testInfo.project.name.endsWith('mobile');
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const documentTitle = `Story board ${suffix}`;
  const firstTitle = `Opening ${suffix}`;
  const secondTitle = `Crossroads ${suffix}`;
  const words = Array.from({ length: 55 }, (_, index) => `word${index + 1}`).join(' ');

  const documentResponse = await page.request.post('/api/documents', {
    data: { title: documentTitle, content: '', documentType: 'fiction' },
  });
  expect(documentResponse.ok()).toBe(true);
  const document = await documentResponse.json();

  const firstResponse = await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: firstTitle, content: `<p>${words}</p>`, position: 0 },
  });
  expect(firstResponse.ok()).toBe(true);
  const firstChapter = await firstResponse.json();
  const secondResponse = await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: secondTitle, content: '<p>A short turning point arrives.</p>', position: 1 },
  });
  expect(secondResponse.ok()).toBe(true);
  const secondChapter = await secondResponse.json();

  try {
    await page.addInitScript(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await selectDocument(page, document.id, documentTitle);
    await openBoard(page, isMobile);

    await expect(page.getByTestId(`card-${firstChapter.id}`)).toBeVisible();
    await expect(page.getByTestId(`count-${firstChapter.id}`)).toHaveText('55 words');
    await expect(page.getByTestId(`synopsis-${firstChapter.id}`)).toContainText('word1 word2 word3');
    await expect(page.getByTestId(`synopsis-${firstChapter.id}`)).not.toContainText('word51');

    const columnCount = await page.getByTestId('board-grid').evaluate(element =>
      getComputedStyle(element).gridTemplateColumns.split(' ').length
    );
    expect(columnCount).toBe(isMobile ? 1 : 4);

    const colorSaved = page.waitForResponse(response =>
      response.url().endsWith(`/api/chapters/${firstChapter.id}`) &&
      response.request().method() === 'PATCH' &&
      response.ok()
    );
    await page.getByTestId(`color-control-${firstChapter.id}`).click();
    await page.getByTestId(`color-option-${firstChapter.id}-rose`).click();
    await colorSaved;
    await expect(page.getByTestId(`card-${firstChapter.id}`)).toHaveAttribute('data-color', 'rose');

    const reordered = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/chapters/order`) &&
      response.request().method() === 'PATCH' &&
      response.ok()
    );
    if (isMobile) {
      const handleBox = await page.getByTestId(`drag-handle-${secondChapter.id}`).boundingBox();
      const firstCardBox = await page.getByTestId(`card-${firstChapter.id}`).boundingBox();
      expect(handleBox).not.toBeNull();
      expect(firstCardBox).not.toBeNull();
      await touchDrag(
        page,
        { x: handleBox!.x + handleBox!.width / 2, y: handleBox!.y + handleBox!.height / 2 },
        { x: firstCardBox!.x + firstCardBox!.width / 2, y: firstCardBox!.y + firstCardBox!.height / 2 }
      );
    } else {
      const handleBox = await page.getByTestId(`drag-handle-${secondChapter.id}`).boundingBox();
      const firstCardBox = await page.getByTestId(`card-${firstChapter.id}`).boundingBox();
      expect(handleBox).not.toBeNull();
      expect(firstCardBox).not.toBeNull();
      await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
      await page.mouse.down();
      await page.mouse.move(firstCardBox!.x + firstCardBox!.width / 2, firstCardBox!.y + firstCardBox!.height / 2, { steps: 8 });
      await page.mouse.up();
    }
    await reordered;
    await expect(page.locator('[data-testid^="card-"]').first()).toContainText(secondTitle);

    const chapterCreated = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/chapters`) &&
      response.request().method() === 'POST' &&
      response.ok()
    );
    await page.getByTestId('button-add-chapter').click();
    const createdResponse = await chapterCreated;
    const createdChapter = await createdResponse.json();
    await expect(page.getByTestId(`card-${createdChapter.id}`)).toBeVisible();

    await page.getByTestId(`card-${secondChapter.id}`).click();
    await expect(page.getByTestId('board')).not.toBeVisible();
    await expect(page.getByTestId('editor-area')).toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await selectDocument(page, document.id, documentTitle);
    await openBoard(page, isMobile);
    await expect(page.locator('[data-testid^="card-"]').first()).toContainText(secondTitle);
    await expect(page.getByTestId(`card-${firstChapter.id}`)).toHaveAttribute('data-color', 'rose');
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});

test('restores card order when saving a reorder fails', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const isMobile = testInfo.project.name.endsWith('mobile');
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const documentTitle = `Story board rollback ${suffix}`;

  const documentResponse = await page.request.post('/api/documents', {
    data: { title: documentTitle, content: '', documentType: 'fiction' },
  });
  expect(documentResponse.ok()).toBe(true);
  const document = await documentResponse.json();
  const firstResponse = await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: `First ${suffix}`, content: '', position: 0 },
  });
  const firstChapter = await firstResponse.json();
  await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: `Second ${suffix}`, content: '', position: 1 },
  });

  try {
    await page.addInitScript(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });
    let reorderRequests = 0;
    await page.route(`**/api/documents/${document.id}/chapters/order`, async route => {
      reorderRequests += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary reorder failure' }),
      });
    });
    await page.route(`**/api/chapters/${firstChapter.id}`, async route => {
      const payload = route.request().postDataJSON();
      if (route.request().method() === 'PATCH' && payload && 'cardColor' in payload) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporary color failure' }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await selectDocument(page, document.id, documentTitle);
    await openBoard(page, isMobile);

    if (isMobile) {
      const firstHandleBox = await page.getByTestId(`drag-handle-${firstChapter.id}`).boundingBox();
      const secondCard = page.locator('[data-testid^="card-"]').nth(1);
      const secondCardBox = await secondCard.boundingBox();
      expect(firstHandleBox).not.toBeNull();
      expect(secondCardBox).not.toBeNull();
      await touchDrag(
        page,
        { x: firstHandleBox!.x + firstHandleBox!.width / 2, y: firstHandleBox!.y + firstHandleBox!.height / 2 },
        { x: secondCardBox!.x + secondCardBox!.width / 2, y: secondCardBox!.y + secondCardBox!.height / 2 },
        true
      );
      await page.waitForTimeout(150);
      expect(reorderRequests).toBe(0);
      await expect(page.locator('[data-testid^="card-"]').first()).toContainText(`First ${suffix}`);
    }

    const failedReorder = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/chapters/order`) &&
      response.status() === 500
    );
    await page.getByTestId(`drag-handle-${firstChapter.id}`).focus();
    await page.keyboard.press('ArrowRight');
    await failedReorder;
    await expect(page.getByText('Could not reorder chapters', { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid^="card-"]').first()).toContainText(`First ${suffix}`);

    const failedColor = page.waitForResponse(response =>
      response.url().endsWith(`/api/chapters/${firstChapter.id}`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 500
    );
    await page.getByTestId(`color-control-${firstChapter.id}`).click();
    await page.getByTestId(`color-option-${firstChapter.id}-sky`).click();
    await failedColor;
    await expect(page.getByText('Could not save card color', { exact: true })).toBeVisible();
    await expect(page.getByTestId(`card-${firstChapter.id}`)).toHaveAttribute('data-color', 'lavender');
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});

test('keeps the current chapter safe when switching documents fails', async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const targetResponse = await page.request.post('/api/documents', {
    data: { title: `Unavailable ${suffix}`, content: '', documentType: 'fiction' },
  });
  const targetDocument = await targetResponse.json();
  await page.request.post(`/api/documents/${targetDocument.id}/chapters`, {
    data: { title: 'Target chapter', content: '', position: 0 },
  });

  const currentResponse = await page.request.post('/api/documents', {
    data: { title: `Current ${suffix}`, content: '', documentType: 'fiction' },
  });
  const currentDocument = await currentResponse.json();
  const currentChapterResponse = await page.request.post(`/api/documents/${currentDocument.id}/chapters`, {
    data: { title: 'Safe chapter', content: '<p>Original text</p>', position: 0 },
  });
  const currentChapter = await currentChapterResponse.json();

  try {
    await page.addInitScript(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });
    await page.route(`**/api/documents/${targetDocument.id}`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporary document failure' }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await selectDocument(page, currentDocument.id, `Current ${suffix}`);

    await page.getByTestId('toggle-doc-list').click();
    const failedSwitch = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${targetDocument.id}`) &&
      response.request().method() === 'GET' &&
      response.status() === 500
    );
    await page.getByTestId(`doc-item-${targetDocument.id}`).click();
    await failedSwitch;

    await expect(page.getByText('Could not switch documents', { exact: true })).toBeVisible();
    await expect(page.getByTestId('input-title')).toHaveValue(`Current ${suffix}`);
    await expect(page.getByTestId('editor-area')).toContainText('Original text');

    const savedToOriginalChapter = page.waitForResponse(response =>
      response.url().endsWith(`/api/chapters/${currentChapter.id}`) &&
      response.request().method() === 'PATCH' &&
      response.ok()
    );
    await page.getByTestId('editor-area').fill('Edits after the failed switch');
    await savedToOriginalChapter;

    const persistedResponse = await page.request.get(`/api/documents/${currentDocument.id}/chapters`);
    const persistedChapters = await persistedResponse.json();
    expect(persistedChapters.find((chapter: { id: number }) => chapter.id === currentChapter.id)?.content)
      .toContain('Edits after the failed switch');
  } finally {
    await page.request.delete(`/api/documents/${currentDocument.id}`);
    await page.request.delete(`/api/documents/${targetDocument.id}`);
  }
});