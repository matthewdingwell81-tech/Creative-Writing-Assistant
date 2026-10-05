import { test, expect, type Page, type Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { FEATURE_TOURS, FULL_TOUR } from '../src/lib/tutorial';

async function openBoard(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByTestId('btn-mobile-overflow').click();
    await page.getByTestId('mobile-view-board').click();
  } else await page.getByTestId('button-view-board').click();
  await expect(page.getByTestId('board')).toBeVisible();
}
async function selectDoc(page: Page, id: number) {
  await page.getByTestId('toggle-doc-list').click();
  await page.getByTestId(`doc-item-${id}`).click();
}
const visibleForm = (page: Page) => page.locator('[data-testid="planning-form"]:visible');
async function save(page: Page, form: Locator) {
  await form.getByTestId('planning-save').click();
  await expect(form).toHaveCount(0);
}
async function add(page: Page, kind: string, title: string) {
  await page.getByTestId(`planning-tab-${kind}`).click();
  await page.getByTestId(`planning-section-${kind}`).getByTestId('planning-add').click();
  const form = visibleForm(page);
  await form.getByTestId('planning-title').fill(title);
  return form;
}
const record = (page: Page, title: string) => page.locator('article[data-testid^="planning-record-"]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('Story Board tour explains every planning view and opens each target', async ({ page, isMobile }, testInfo) => {
  const signup = await page.request.post('/api/auth/register', {
    data: { username: `planning_tour_${randomUUID().slice(0, 12)}`, password: randomUUID() },
  });
  expect(signup.status()).toBe(201);
  const user = await signup.json();
  await page.addInitScript(id => {
    localStorage.setItem(`lumina_tutorial_done:${encodeURIComponent(id)}`, JSON.stringify({ full: true }));
  }, user.id);
  const response = await page.request.post('/api/documents', {
    data: { title: 'Story Board tutorial test', content: '', documentType: 'fiction' },
  });
  expect(response.status()).toBe(201);
  const doc = await response.json();
  try {
    await page.goto('/');
    await expect(page.getByTestId('editor-area')).toBeVisible();
    if (isMobile) {
      await page.getByTestId('btn-mobile-overflow').click();
      await page.getByTestId('tour-mobile-storyBoard').click();
    } else {
      await page.getByTestId('btn-help-menu').click();
      await page.getByTestId('tour-storyBoard').click();
    }
    const steps = FEATURE_TOURS.storyBoard;
    expect(steps).toHaveLength(8);
    expect(FULL_TOUR.filter(s => s.featureKey === 'storyBoard')).toEqual(steps);
    for (const [index, step] of steps.entries()) {
      const card = page.getByTestId('tutorial-card');
      await expect(card).toContainText(step.title);
      await expect(card).toContainText(`Step ${index + 1} of ${steps.length}`);
      await expect(page.getByTestId(`planning-tab-${step.storyBoardSection}`)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator(step.target)).toBeVisible();
      await expect.poll(async () => {
        const r = await page.locator(step.target).boundingBox();
        return !!r && r.y < page.viewportSize()!.height && r.y + r.height > 0;
      }).toBeTruthy();
      if (index === 4) {
        // Prev must reopen Characters rather than highlighting a hidden panel.
        await page.getByTestId('tutorial-prev').click();
        await expect(card).toContainText('Connect Your Characters');
        await expect(page.getByTestId('planning-tab-character')).toHaveAttribute('aria-selected', 'true');
        await page.getByTestId('tutorial-next').click();
        await expect(card).toContainText('Build Your Story Timeline');
        await expect(page.getByTestId('planning-tab-timeline')).toHaveAttribute('aria-selected', 'true');
      }
      if (index === steps.length - 1) {
        await page.screenshot({ path: testInfo.outputPath('story-board-tour.png') });
        await page.getByTestId('tutorial-done').click();
      } else await page.getByTestId('tutorial-next').click();
    }
    await expect(page.getByTestId('tutorial-card')).toHaveCount(0);
    const completed = await page.evaluate(id => JSON.parse(localStorage.getItem(`lumina_tutorial_done:${encodeURIComponent(id)}`) || '{}'), user.id);
    expect(completed.storyBoard).toBe(true);
    // Tours explain existing controls; they must not create or change a plan.
    expect(await (await page.request.get(`/api/documents/${doc.id}/planning`)).json()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await page.request.delete(`/api/documents/${doc.id}`);
  }
});

test('plan a story, persist and isolate records, recover errors, and keep chapter behavior', async ({ page, isMobile }) => {
  test.setTimeout(120_000);
  const signup = await page.request.post('/api/auth/register', {
    data: { username: `planning_ui_${randomUUID().slice(0, 12)}`, password: randomUUID() },
  });
  expect(signup.status()).toBe(201);
  const user = await signup.json();
  await page.addInitScript(id => {
    const done = { full: true, editor: true, sidebar: true, scratchpad: true, documents: true, storyboard: true, research: true };
    localStorage.setItem(`lumina_tutorial_done:${encodeURIComponent(id)}`, JSON.stringify(done));
    localStorage.setItem(`lumina_first_use:${encodeURIComponent(id)}`, JSON.stringify(done));
  }, user.id);
  const docs: number[] = [];
  const createDoc = async (title: string) => {
    const response = await page.request.post('/api/documents', { data: { title, content: '', documentType: 'fiction' } });
    expect(response.status()).toBe(201);
    const d = await response.json();
    docs.push(d.id);
    const chapter = await page.request.post(`/api/documents/${d.id}/chapters`, { data: { title: `${title} chapter`, position: 0 } });
    expect(chapter.status()).toBe(201);
    return { ...d, chapter: await chapter.json() };
  };
  const second = await createDoc('Other planning story');
  const first = await createDoc('Main planning story');
  try {
    await page.goto('/');
    await expect(page.getByTestId('input-title')).toHaveValue(first.title);
    await openBoard(page, !!isMobile);
    await expect(page.getByTestId(`card-${first.chapter.id}`)).toBeVisible();

    let form = await add(page, 'character', 'Mara');
    await form.getByLabel('Role', { exact: true }).fill('Protagonist');
    await form.getByLabel('Motivations').fill('Find her brother');
    await form.getByLabel('Traits').fill('Cautious, loyal');
    await form.getByLabel('Arc', { exact: true }).fill('Learns to trust');
    await form.getByLabel('Detailed outline').fill('Raised in the mountain city');
    await form.getByLabel('Linked chapter').selectOption(String(first.chapter.id));
    await save(page, form);
    await expect(record(page, 'Mara')).toContainText('Learns to trust');
    form = await add(page, 'character', 'Ivo');
    await save(page, form);

    await page.getByTestId('planning-add-relationship').click();
    form = visibleForm(page);
    await form.getByTestId('planning-title').fill('Estranged siblings');
    await form.getByLabel('Character', { exact: true }).selectOption({ label: 'Mara' });
    await form.getByLabel('Related character').selectOption({ label: 'Ivo' });
    await save(page, form);
    await expect(record(page, 'Estranged siblings')).toContainText('Mara & Ivo');

    form = await add(page, 'timeline', 'Arrival');
    await form.getByLabel('When', { exact: true }).fill('Third winter');
    await form.getByLabel('Linked chapter').selectOption(String(first.chapter.id));
    await form.getByLabel('Linked character').selectOption({ label: 'Mara' });
    await save(page, form);
    form = await add(page, 'timeline', 'Reunion');
    await save(page, form);
    await record(page, 'Reunion').getByRole('button', { name: 'Move Reunion earlier', exact: true }).click();
    await expect(page.getByTestId('planning-section-timeline').locator('article').first()).toContainText('Reunion');

    form = await add(page, 'worldbuilding', 'Mountain city');
    await form.getByLabel('Category', { exact: true }).fill('Places');
    await form.getByLabel('Details', { exact: true }).fill('Built of blue stone');
    await save(page, form);
    await expect(record(page, 'Mountain city')).toContainText('Places');
    await record(page, 'Mountain city').getByRole('button', { name: 'Edit Mountain city', exact: true }).click();
    form = visibleForm(page);
    await form.getByLabel('Details', { exact: true }).fill('Built of green stone');
    await save(page, form);
    await expect(record(page, 'Mountain city')).toContainText('green stone');

    form = await add(page, 'note', 'Loose ending');
    await form.getByLabel('Category', { exact: true }).fill('Plot questions');
    await form.getByLabel('Details', { exact: true }).fill('Why does Ivo leave?');
    // Tab switches keep unsaved drafts; failed saves also keep the draft.
    await page.getByTestId('planning-tab-timeline').click();
    await page.getByTestId('planning-tab-note').click();
    await expect(visibleForm(page).getByLabel('Details', { exact: true })).toHaveValue('Why does Ivo leave?');
    await page.route('**/api/documents/*/planning', route => route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Test save failed"}' }) : route.continue());
    await visibleForm(page).getByTestId('planning-save').click();
    await expect(visibleForm(page).getByRole('alert')).toHaveText('Test save failed');
    await expect(visibleForm(page).getByTestId('planning-title')).toHaveValue('Loose ending');
    await page.unroute('**/api/documents/*/planning');
    await save(page, visibleForm(page));
    await expect(record(page, 'Loose ending')).toContainText('Why does Ivo leave?');
    await record(page, 'Loose ending').getByRole('button', { name: 'Edit Loose ending', exact: true }).click();
    form = visibleForm(page);
    await form.getByTestId('planning-title').fill('Revised ending');
    await form.getByLabel('Details', { exact: true }).fill('');
    await save(page, form);
    await expect(record(page, 'Revised ending')).not.toContainText('Why does Ivo leave?');

    await page.reload();
    await openBoard(page, !!isMobile);
    await page.getByTestId('planning-tab-character').click();
    await expect(record(page, 'Mara')).toContainText('Learns to trust');
    await expect(record(page, 'Estranged siblings')).toBeVisible();
    await page.screenshot({ path: `test-results/${test.info().project.name}-characters.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.getByTestId('planning-tab-timeline').click();
    await expect(page.getByTestId('planning-section-timeline').locator('article').first()).toContainText('Reunion');
    await page.screenshot({ path: `test-results/${test.info().project.name}-timeline.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await record(page, 'Arrival').getByRole('button', { name: `${first.title} chapter`, exact: true }).click();
    await expect(page.getByTestId('editor-area')).toBeVisible();
    await openBoard(page, !!isMobile);

    await selectDoc(page, second.id);
    await expect(page.getByTestId(`card-${second.chapter.id}`)).toBeVisible();
    await expect(page.getByTestId(`card-${first.chapter.id}`)).toHaveCount(0);
    await page.getByTestId('planning-tab-character').click();
    await expect(record(page, 'Mara')).toHaveCount(0);
    await selectDoc(page, first.id);
    await expect(page.getByTestId(`card-${first.chapter.id}`)).toBeVisible();
    await page.getByTestId('planning-tab-character').click();
    await expect(record(page, 'Mara')).toBeVisible();
    await record(page, 'Mara').getByRole('button', { name: 'Delete Mara', exact: true }).click();
    await expect(record(page, 'Mara').getByRole('alertdialog')).toContainText('also deletes every relationship');
    await record(page, 'Mara').getByTestId(/planning-delete-confirm-/).click();
    await expect(record(page, 'Mara')).toHaveCount(0);
    await expect(record(page, 'Estranged siblings')).toHaveCount(0);
    await page.getByTestId('planning-tab-timeline').click();
    await expect(record(page, 'Arrival')).toBeVisible();
    await expect(record(page, 'Arrival')).not.toContainText('Mara');
    for (const [kind, title] of [['timeline', 'Reunion'], ['worldbuilding', 'Mountain city'], ['note', 'Revised ending']]) {
      await page.getByTestId(`planning-tab-${kind}`).click();
      await record(page, title).getByRole('button', { name: `Delete ${title}`, exact: true }).click();
      await record(page, title).getByTestId(/planning-delete-confirm-/).click();
      await expect(record(page, title)).toHaveCount(0);
    }
    await page.getByTestId('planning-tab-chapters').click();
    await page.getByTestId(`color-control-${first.chapter.id}`).click();
    await page.getByTestId(`color-option-${first.chapter.id}-sage`).click();
    await expect(page.getByTestId(`card-${first.chapter.id}`)).toHaveAttribute('data-color', 'sage');
    await page.getByTestId('button-add-chapter').click();
    await expect(page.getByTestId('board-grid').locator('[data-chapter-id]')).toHaveCount(2);
    const handles = page.locator('[data-testid="board-grid"] [data-testid^="drag-handle-"]');
    await handles.nth(1).focus();
    await handles.nth(1).press('ArrowUp');
    await expect(page.getByTestId('board-grid').locator('[data-chapter-id]').last()).toHaveAttribute('data-chapter-id', String(first.chapter.id));
    await page.getByTestId(`card-${first.chapter.id}`).getByRole('button', { name: /Open .* in editor/ }).click();
    await expect(page.getByTestId('editor-area')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  } finally {
    for (const id of docs) await page.request.delete(`/api/documents/${id}`);
  }
});
