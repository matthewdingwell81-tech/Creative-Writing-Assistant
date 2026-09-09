import { test, expect, type Page } from '@playwright/test';

async function selectDocument(page: Page, id: number, title: string) {
  if (await page.getByTestId('input-title').inputValue().catch(() => '') === title) return;
  await page.getByTestId('toggle-doc-list').click();
  await expect(page.getByTestId(`doc-item-${id}`)).toBeVisible();
  await page.getByTestId(`doc-item-${id}`).click();
  await expect(page.getByTestId('input-title')).toHaveValue(title);
}

async function openView(page: Page, view: 'research' | 'editor', mobile: boolean) {
  if (mobile) {
    const trigger = page.getByTestId('btn-mobile-overflow');
    await trigger.click();
    await page.getByTestId(`mobile-view-${view}`).click();
    await expect(trigger).toHaveAttribute('data-state', 'closed');
  } else {
    await page.getByTestId(`button-view-${view}`).click();
  }
}

test('completes the Research Library workflow', async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  page.setDefaultTimeout(10_000);
  const mobile = testInfo.project.name.endsWith('mobile');
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const documentTitle = `Research document ${suffix}`;
  const chapterTitle = `Research chapter ${suffix}`;
  const initialTitle = `Library note ${suffix}`;
  const editedTitle = `Edited note ${suffix}`;
  const chapterNoteTitle = `Chapter note ${suffix}`;

  const documentResponse = await page.request.post('/api/documents', {
    data: { title: documentTitle, content: '', documentType: 'fiction' },
  });
  expect(documentResponse.ok()).toBe(true);
  const document = await documentResponse.json();
  const chapterResponse = await page.request.post(`/api/documents/${document.id}/chapters`, {
    data: { title: chapterTitle, content: '<p>Chapter context for research.</p>', position: 0 },
  });
  expect(chapterResponse.ok()).toBe(true);
  const chapter = await chapterResponse.json();

  try {
    await page.addInitScript(() => {
      localStorage.setItem('lumina_tutorial_done', JSON.stringify({ full: true }));
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const previewBanner = page.getByRole('button', { name: 'Close banner' });
    if (await previewBanner.isVisible().catch(() => false)) await previewBanner.click();
    await selectDocument(page, document.id, documentTitle);
    await openView(page, 'research', mobile);
    await expect(page.getByTestId('research-library')).toBeVisible();

    // Create a global text item through the library form.
    await page.getByTestId(mobile ? 'btn-add-research-mobile' : 'btn-add-research').click();
    const form = page.getByTestId('research-form-dialog');
    await expect(form).toBeVisible();
    await form.getByTestId('input-title').fill(initialTitle);
    await form.getByTestId('input-content').fill(`Original research content ${suffix}`);
    await form.getByTestId('input-tags').fill('lore, testing');
    const created = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/research`) &&
      response.request().method() === 'POST' &&
      response.ok()
    );
    await form.getByTestId('button-submit-research').click();
    const item = await (await created).json();
    expect(item).toBeTruthy();
    expect(item.chapterIds).toEqual([]);

    // Edit, favorite, and filter the item.
    await expect(page.getByTestId(`research-card-${item.id}`)).toBeVisible();
    await page.getByTestId(`menu-${item.id}`).click();
    await page.getByTestId(`menu-edit-${item.id}`).click();
    await expect(form).toBeVisible();
    await form.getByTestId('input-title').fill(editedTitle);
    await form.getByTestId('input-content').fill(`Edited research content ${suffix}`);
    const edited = page.waitForResponse(response =>
      response.url().endsWith(`/api/research/${item.id}`) &&
      response.request().method() === 'PATCH' &&
      response.ok()
    );
    await form.getByTestId('button-submit-research').click();
    await edited;
    await expect(form).not.toBeVisible();
    await page.getByTestId(`menu-${item.id}`).click();
    const favorited = page.waitForResponse(response =>
      response.url().endsWith(`/api/research/${item.id}`) &&
      response.request().method() === 'PATCH' &&
      response.ok()
    );
    await page.getByTestId(`menu-favorite-${item.id}`).click();
    await favorited;
    await expect(page.getByTestId(`favorite-${item.id}`)).toBeVisible();
    await page.getByTestId('input-search-research').fill(editedTitle);
    await expect(page.getByTestId(`research-card-${item.id}`)).toBeVisible();
    await expect(page.getByTestId('research-library')).not.toContainText(initialTitle);

    // Reload, then reopen the view to verify server-backed persistence.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await selectDocument(page, document.id, documentTitle);
    await openView(page, 'research', mobile);
    await expect(page.getByTestId(`research-card-${item.id}`)).toBeVisible();
    await expect(page.getByTestId(`title-${item.id}`)).toContainText(editedTitle);
    await expect(page.getByTestId(`favorite-${item.id}`)).toBeVisible();
    await page.screenshot({
      path: `../../screenshots/research-library-${testInfo.project.name}.png`,
      fullPage: true,
    });

    // The editor floating action can attach and detach the library item.
    await openView(page, 'editor', mobile);
    const relatedRefresh = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/chapters/${chapter.id}/research/related`) &&
      response.request().method() === 'GET' &&
      response.ok()
    );
    await page.getByTestId('editor-area').fill(`Chapter context now references ${editedTitle}.`);
    await relatedRefresh;
    await page.getByTestId('fab-research').click();
    await expect(page.getByText('Research Context')).toBeVisible();
    await expect(page.getByTestId(`floating-item-${item.id}`)).toBeVisible();
    await page.getByTestId('tab-all').click();
    await expect(page.getByTestId(`floating-item-${item.id}`)).toBeVisible();
    await page.screenshot({
      path: `../../screenshots/research-floating-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page.getByTestId(`btn-toggle-attach-${item.id}`).click();
    await expect.poll(async () => {
      const response = await page.request.get(`/api/documents/${document.id}/research`);
      const list = await response.json();
      return list.find((entry: { id: number }) => entry.id === item.id)?.chapterIds;
    }).toEqual([chapter.id]);
    await expect(page.getByTestId(`btn-toggle-attach-${item.id}`)).toHaveAttribute('title', 'Detach from chapter');
    await page.getByTestId(`btn-toggle-attach-${item.id}`).click();
    await expect.poll(async () => {
      const response = await page.request.get(`/api/documents/${document.id}/research`);
      const list = await response.json();
      return list.find((entry: { id: number }) => entry.id === item.id)?.chapterIds;
    }).toEqual([]);

    // Quick Add inherits the active chapter and creates a chapter-linked note.
    await page.getByTestId('btn-quick-add-research').click();
    await expect(form).toBeVisible();
    await form.getByTestId('input-title').fill(chapterNoteTitle);
    await form.getByTestId('input-content').fill(`A note linked to ${chapterTitle}`);
    const quickAdded = page.waitForResponse(response =>
      response.url().endsWith(`/api/documents/${document.id}/research`) &&
      response.request().method() === 'POST' &&
      response.ok()
    );
    await form.getByTestId('button-submit-research').click();
    await quickAdded;
    await expect.poll(async () => {
      const response = await page.request.get(`/api/documents/${document.id}/research`);
      const list = await response.json();
      return list.find((entry: { title: string }) => entry.title === chapterNoteTitle)?.chapterIds;
    }).toEqual([chapter.id]);

    await page.keyboard.press('Escape');
  } finally {
    await page.request.delete(`/api/documents/${document.id}`);
  }
});