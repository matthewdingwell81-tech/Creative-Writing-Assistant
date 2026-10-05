export type TourKey = 'full' | 'focusMode' | 'scratchpad' | 'assistant' | 'chapters' | 'googleDocs' | 'export' | 'storyBoard' | 'research';

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TutorialStep {
  id: string;
  featureKey: TourKey;
  /** CSS selector or data-testid attribute value */
  target: string;
  title: string;
  body: string;
  placement?: Placement;
  /**
   * If true and the target element cannot be found in the DOM after retries,
   * this step is automatically skipped rather than shown as a dimmed overlay.
   */
  skipIfTargetMissing?: boolean;
  /**
   * When the target element cannot be found after retries and `skipIfTargetMissing`
   * is false, this message is shown in the tooltip card so the user understands
   * why there is no spotlight highlight.
   * e.g. "Select some text in the editor first to see this feature."
   */
  missingTargetHint?: string;
  /**
   * Optional key for a side-effect handler registered by Home.tsx.
   * Called when this step becomes active so the required UI panel is opened.
   * e.g. 'openAssistant', 'openScratchpad'
   */
  sideEffect?: string;
  /** Select this Story Board section before highlighting its controls. */
  storyBoardSection?: 'chapters' | 'character' | 'timeline' | 'worldbuilding' | 'note';
}

export const FULL_TOUR: TutorialStep[] = [
  // 1. Documents
  {
    id: 'doc-list-toggle',
    featureKey: 'full',
    target: '[data-testid="toggle-doc-list"]',
    title: 'Your Documents',
    body: 'Click here to open the document panel where you can create new documents and switch between them.',
    placement: 'bottom',
  },
  {
    id: 'new-doc',
    featureKey: 'full',
    target: '[data-testid="btn-new-doc"]',
    title: 'Create a New Document',
    body: 'Click the new document icon to start a fresh document. Each document is saved to your account automatically.',
    placement: 'bottom',
    missingTargetHint: 'Open the document panel first (tap the panel icon in the top-left) to see the New Document button.',
  },
  // 2. Chapters (only visible when a document is open)
  {
    id: 'chapters',
    featureKey: 'chapters',
    target: '[data-testid="select-chapter"]',
    title: 'Chapters',
    body: 'Use the chapter selector to add chapters, switch between them, and organise your document into sections.',
    placement: 'bottom',
    missingTargetHint: 'Open or create a document first — the chapter selector appears in the editor toolbar.',
  },
  {
    id: 'rename-chapter',
    featureKey: 'chapters',
    target: '[data-testid="btn-rename-chapter"]',
    title: 'Rename a Chapter',
    body: 'Click the pencil icon next to the chapter selector to rename the current chapter.',
    placement: 'bottom',
    missingTargetHint: 'Open a document to see the chapter controls in the toolbar.',
  },
  // 3. Document type (desktop only)
  {
    id: 'doc-type',
    featureKey: 'full',
    target: '[data-testid="select-doc-type"]',
    title: 'Document Type',
    body: 'Set the genre of your work — Fiction, Non-Fiction, Essay, Blog Post, Script, or General. This shapes the AI suggestions you receive.',
    placement: 'bottom',
    missingTargetHint: 'Open a document to see the Document Type selector in the toolbar.',
  },
  // 4. Writing editor (requires an open document)
  {
    id: 'editor-title',
    featureKey: 'full',
    target: '[data-testid="input-title"]',
    title: 'Document Title',
    body: 'Type your document title here. Changes are saved automatically so you never lose your work.',
    placement: 'bottom',
    missingTargetHint: 'Open or create a document to see the title field.',
  },
  {
    id: 'editor-area',
    featureKey: 'full',
    target: '[data-testid="editor-area"]',
    title: 'The Writing Area',
    body: 'Write your prose here. Lumina automatically saves as you type and analyses your writing in the background.',
    placement: 'top',
    missingTargetHint: 'Open or create a document to see the writing area.',
  },
  {
    id: 'save-status',
    featureKey: 'full',
    target: '[data-testid="save-status"]',
    title: 'Auto-Save Status',
    body: 'The save indicator shows whether your latest changes have been saved. You\'ll never lose progress.',
    placement: 'bottom',
  },
  // 5–8. Creative Assistant tabs
  // sideEffect 'openAssistant' ensures the sidebar/sheet is open on both desktop and mobile
  {
    id: 'grammar-tab',
    featureKey: 'assistant',
    target: '[data-testid="tab-grammar"]',
    title: 'Grammar Suggestions',
    body: 'The Grammar tab highlights issues in your writing. Click any card to jump to the passage, then apply or dismiss the suggestion.',
    placement: 'bottom',
    sideEffect: 'openAssistant',
  },
  {
    id: 'review-tab',
    featureKey: 'assistant',
    target: '[data-testid="tab-review"]',
    title: 'Style & Vocabulary Review',
    body: 'The Review tab offers vocabulary and style suggestions to make your writing clearer and more compelling.',
    placement: 'bottom',
    sideEffect: 'openAssistant',
  },
  {
    id: 'story-tab',
    featureKey: 'assistant',
    target: '[data-testid="tab-story"]',
    title: 'Story Arc Feedback',
    body: 'The Story tab analyses pacing and plot structure, giving you high-level feedback on your narrative.',
    placement: 'bottom',
    sideEffect: 'openAssistant',
  },
  {
    id: 'coach-tab',
    featureKey: 'assistant',
    target: '[data-testid="tab-coach"]',
    title: 'Writing Coach',
    body: 'Chat directly with your AI writing coach. Ask questions, brainstorm plot points, or get feedback on any aspect of your work.',
    placement: 'bottom',
    sideEffect: 'openAssistant',
  },
  // 7. Ideas tab
  {
    id: 'ideas-tab',
    featureKey: 'assistant',
    target: '[data-testid="tab-ideas"]',
    title: 'AI Idea Generation',
    body: 'The Ideas tab lets you ask the AI to generate ideas, brainstorm alternatives, or explore "what if" scenarios based on your document.',
    placement: 'bottom',
    sideEffect: 'openAssistant',
  },
  // 8. Review selection — only visible when text is selected
  {
    id: 'review-selection',
    featureKey: 'assistant',
    target: '[data-testid="btn-review-selection"]',
    title: 'Review a Selection',
    body: 'Select any passage in the editor, then click "Review This Selection" to get focused AI feedback on just that text.',
    placement: 'top',
    missingTargetHint: 'Select some text in the editor first — the "Review This Selection" button will appear above it.',
  },
  // 9. Ideas Scratchpad toggle (fixed button; only shown when doc is active)
  {
    id: 'scratchpad-toggle',
    featureKey: 'scratchpad',
    target: '[data-testid="btn-toggle-scratchpad"]',
    title: 'Ideas Scratchpad',
    body: 'Click the lightbulb tab on the left edge to open your scratchpad — a quick notepad for ideas, snippets, and inspiration.',
    placement: 'right',
    missingTargetHint: 'Open a document first — the scratchpad button appears on the left edge of the editor.',
  },
  // 10. Focus Mode (desktop header only)
  {
    id: 'focus-mode',
    featureKey: 'focusMode',
    target: '[data-testid="btn-toggle-focus-mode"]',
    title: 'Focus Mode',
    body: 'Focus Mode hides the AI sidebar so you can write without distractions. Grammar analysis is paused while active. Click again to return to normal view.',
    placement: 'bottom',
    missingTargetHint: 'Focus Mode is available in the desktop toolbar — open a document on a wider screen to see it.',
  },
  // 11. Export (desktop only)
  {
    id: 'export-menu',
    featureKey: 'export',
    target: '[data-testid="btn-export-menu"]',
    title: 'Export Your Work',
    body: 'Click Export to download your document as a plain-text .txt file that you can open in any editor.',
    placement: 'bottom',
    missingTargetHint: 'Open a document to see the Export button in the toolbar.',
  },
  // 12. Google Docs (desktop only)
  {
    id: 'gdocs-import',
    featureKey: 'googleDocs',
    target: '[data-testid="btn-import-gdocs"]',
    title: 'Import from Google Docs',
    body: 'Import an existing Google Doc directly into Lumina, or export your work back to Google Docs at any time.',
    placement: 'bottom',
    missingTargetHint: 'Open a document to see the Google Docs import button in the toolbar.',
  },
  // 13. Story Board and Research Library
  {
    id: 'story-board',
    featureKey: 'storyBoard',
    target: '[data-testid="board"]',
    title: 'Story Board',
    body: 'Plan the active story alongside your manuscript. Use Chapters, Characters, Timeline, Worldbuilding, and Notes to organize your writing without changing the manuscript text.',
    placement: 'top',
    sideEffect: 'openStoryBoard',
    storyBoardSection: 'chapters',
    skipIfTargetMissing: true,
    missingTargetHint: 'Open or create a document first to use Story Board.',
  },
  {
    id: 'story-board-chapters',
    featureKey: 'storyBoard',
    target: '[data-testid="planning-tab-chapters"]',
    title: 'Arrange Your Chapters',
    body: 'Review chapter synopses and word counts, change card colors, and drag the handles to reorder chapters. You can also focus a reorder handle and use the arrow keys. Open a card to return to its chapter in the editor.',
    placement: 'bottom',
    sideEffect: 'openStoryBoard',
    storyBoardSection: 'chapters',
    skipIfTargetMissing: true,
  },
  {
    id: 'story-board-characters',
    featureKey: 'storyBoard',
    target: '[data-testid="planning-heading-character"]',
    title: 'Character Outlines & Arcs',
    body: 'Add a character and outline their role, motivations, traits, and arc. Use the detailed outline for backstory and development, then save. The pencil lets you edit a saved character.',
    placement: 'bottom',
    sideEffect: 'openStoryBoard',
    storyBoardSection: 'character',
    skipIfTargetMissing: true,
  },
  {
    id: 'story-board-relationships',
    featureKey: 'storyBoard',
    target: '[data-testid="planning-heading-relationship"]',
    title: 'Connect Your Characters',
    body: 'After saving at least two characters, add a relationship between them and describe their connection. Deleting a character also removes their relationships and unlinks them from other planning entries; those other entries remain.',
    placement: 'top',
    sideEffect: 'openStoryBoard',
    storyBoardSection: 'character',
    skipIfTargetMissing: true,
  },
  {
    id: 'story-board-timeline',
    featureKey: 'storyBoard',
    target: '[data-testid="planning-heading-timeline"]',
    title: 'Build Your Story Timeline',
    body: 'Add events with details and a When label, such as a date, Day 3, or a fictional season. Optionally link a character and chapter. Use the up and down arrows on saved events to put them in story order.',
    placement: 'bottom',
    sideEffect: 'openStoryBoard',
    storyBoardSection: 'timeline',
    skipIfTargetMissing: true,
  },
  {
    id: 'story-board-worldbuilding',
    featureKey: 'storyBoard',
    target: '[data-testid="planning-heading-worldbuilding"]',
    title: 'Develop Your Story World',
    body: 'Capture places, history, cultures, and rules as worldbuilding entries. Give them categories, then use the Category filter to organize them. These are your story-world notes; keep external references in the Research Library.',
    placement: 'bottom',
    sideEffect: 'openStoryBoard',
    storyBoardSection: 'worldbuilding',
    skipIfTargetMissing: true,
  },
  {
    id: 'story-board-notes',
    featureKey: 'storyBoard',
    target: '[data-testid="planning-heading-note"]',
    title: 'Flexible Planning Cards',
    body: 'Use Notes cards for plot questions, scene ideas, and other story-specific plans. Add details and categories, then edit or delete cards as the story develops. The Ideas Scratchpad remains available for quick thoughts.',
    placement: 'bottom',
    sideEffect: 'openStoryBoard',
    storyBoardSection: 'note',
    skipIfTargetMissing: true,
  },
  {
    id: 'story-board-saving',
    featureKey: 'storyBoard',
    target: '[data-testid="planning-section-note"]',
    title: 'Save & Link Your Plan',
    body: 'Choose a Linked chapter in an entry to connect it to the manuscript; its chapter chip opens the editor. Press Save to keep your changes. Saved planning stays with this document across reloads and document switches. Switching planning tabs keeps an open draft, but save before leaving Story Board. A failed save keeps the form open so you can retry.',
    placement: 'top',
    sideEffect: 'openStoryBoard',
    storyBoardSection: 'note',
    skipIfTargetMissing: true,
  },
  {
    id: 'research-library',
    featureKey: 'research',
    target: '[data-testid="research-library"]',
    title: 'Research Library',
    body: 'Collect notes, links, and images for your project in one place. Use tags, favorites, and scope filters to keep your references organized.',
    placement: 'top',
    sideEffect: 'openResearchLibrary',
    skipIfTargetMissing: true,
    missingTargetHint: 'Open or create a document first to use the Research Library.',
  },
  {
    id: 'research-filters',
    featureKey: 'research',
    target: '[data-testid="input-search-research"]',
    title: 'Find Your References',
    body: 'Search your library and combine type, status, scope, chapter, and tag filters to find the research you need quickly.',
    placement: 'bottom',
    sideEffect: 'openResearchLibrary',
    skipIfTargetMissing: true,
    missingTargetHint: 'Open the Research Library to use its search and filters.',
  },
  {
    id: 'research-context',
    featureKey: 'research',
    target: '[data-testid="fab-research"]',
    title: 'Research Context',
    body: 'Open Research Context from the editor to see research related to the current chapter, items already attached to it, or everything in your library.',
    placement: 'left',
    sideEffect: 'openResearchContext',
    skipIfTargetMissing: true,
    missingTargetHint: 'Open a document in the editor to see Research Context.',
  },
  {
    id: 'research-quick-add',
    featureKey: 'research',
    target: '[data-testid="btn-quick-add-research"]',
    title: 'Quick Add a Note',
    body: 'Add a text note without leaving your chapter. You can attach it to the current chapter or keep it available across the whole document.',
    placement: 'top',
    sideEffect: 'openResearchContext',
    skipIfTargetMissing: true,
    missingTargetHint: 'Open Research Context from the editor to use Quick Add Note.',
  },
];

export const FEATURE_TOURS: Record<TourKey, TutorialStep[]> = {
  full: FULL_TOUR,
  focusMode: FULL_TOUR.filter(s => s.featureKey === 'focusMode'),
  scratchpad: FULL_TOUR.filter(s => s.featureKey === 'scratchpad'),
  assistant: FULL_TOUR.filter(s => s.featureKey === 'assistant' || s.id === 'editor-area'),
  chapters: FULL_TOUR.filter(s => s.featureKey === 'chapters'),
  googleDocs: FULL_TOUR.filter(s => s.featureKey === 'googleDocs'),
  export: FULL_TOUR.filter(s => s.featureKey === 'export'),
  storyBoard: FULL_TOUR.filter(s => s.featureKey === 'storyBoard'),
  research: FULL_TOUR.filter(s => s.featureKey === 'research'),
};

export const TOUR_LABELS: Record<TourKey, string> = {
  full: 'Full tour',
  focusMode: 'Focus Mode',
  scratchpad: 'Ideas Scratchpad',
  assistant: 'Creative Assistant',
  chapters: 'Chapters',
  googleDocs: 'Google Docs',
  export: 'Export',
  storyBoard: 'Story Board',
  research: 'Research Library',
};

const STORAGE_KEY = 'lumina_tutorial_done';
const FIRST_USE_KEY = 'lumina_first_use';

function accountStorageKey(baseKey: string, accountId: string): string {
  return `${baseKey}:${encodeURIComponent(accountId)}`;
}

export function initializeTutorialState(accountId: string): void {
  for (const baseKey of [STORAGE_KEY, FIRST_USE_KEY]) {
    const scopedKey = accountStorageKey(baseKey, accountId);
    const scopedValue = localStorage.getItem(scopedKey);
    const legacyValue = localStorage.getItem(baseKey);

    if (scopedValue === null && legacyValue !== null) {
      localStorage.setItem(scopedKey, legacyValue);
    }
    if (legacyValue !== null) {
      localStorage.removeItem(baseKey);
    }
  }
}

function getAccountState(baseKey: string, accountId: string): Record<string, boolean> {
  try {
    initializeTutorialState(accountId);
    return JSON.parse(localStorage.getItem(accountStorageKey(baseKey, accountId)) || '{}');
  } catch {
    return {};
  }
}

export function getTutorialDone(accountId: string): Record<string, boolean> {
  return getAccountState(STORAGE_KEY, accountId);
}

export function setTutorialDone(accountId: string, key: string): void {
  const done = getTutorialDone(accountId);
  done[key] = true;
  localStorage.setItem(accountStorageKey(STORAGE_KEY, accountId), JSON.stringify(done));
}

export function getFirstUse(accountId: string): Record<string, boolean> {
  return getAccountState(FIRST_USE_KEY, accountId);
}

export function setFirstUseSeen(accountId: string, key: string): void {
  const seen = getFirstUse(accountId);
  seen[key] = true;
  localStorage.setItem(accountStorageKey(FIRST_USE_KEY, accountId), JSON.stringify(seen));
}

/**
 * Clears all stored tutorial progress so that the full tour auto-launches
 * again on next load and all contextual first-use prompts re-fire.
 */
export function resetTourProgress(accountId: string): void {
  localStorage.removeItem(accountStorageKey(STORAGE_KEY, accountId));
  localStorage.removeItem(accountStorageKey(FIRST_USE_KEY, accountId));
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(FIRST_USE_KEY);
}
