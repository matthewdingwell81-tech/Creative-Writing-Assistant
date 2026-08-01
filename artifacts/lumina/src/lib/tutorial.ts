export type TourKey = 'full' | 'focusMode' | 'scratchpad' | 'assistant' | 'chapters' | 'googleDocs' | 'export';

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
    skipIfTargetMissing: true,
  },
  // 2. Chapters (only visible when a document is open)
  {
    id: 'chapters',
    featureKey: 'chapters',
    target: '[data-testid="select-chapter"]',
    title: 'Chapters',
    body: 'Use the chapter selector to add chapters, switch between them, and organise your document into sections.',
    placement: 'bottom',
    skipIfTargetMissing: true,
  },
  {
    id: 'rename-chapter',
    featureKey: 'chapters',
    target: '[data-testid="btn-rename-chapter"]',
    title: 'Rename a Chapter',
    body: 'Click the pencil icon next to the chapter selector to rename the current chapter.',
    placement: 'bottom',
    skipIfTargetMissing: true,
  },
  // 3. Document type (desktop only)
  {
    id: 'doc-type',
    featureKey: 'full',
    target: '[data-testid="select-doc-type"]',
    title: 'Document Type',
    body: 'Set the genre of your work — Fiction, Non-Fiction, Essay, Blog Post, Script, or General. This shapes the AI suggestions you receive.',
    placement: 'bottom',
    skipIfTargetMissing: true,
  },
  // 4. Writing editor (requires an open document)
  {
    id: 'editor-title',
    featureKey: 'full',
    target: '[data-testid="input-title"]',
    title: 'Document Title',
    body: 'Type your document title here. Changes are saved automatically so you never lose your work.',
    placement: 'bottom',
    skipIfTargetMissing: true,
  },
  {
    id: 'editor-area',
    featureKey: 'full',
    target: '[data-testid="editor-area"]',
    title: 'The Writing Area',
    body: 'Write your prose here. Lumina automatically saves as you type and analyses your writing in the background.',
    placement: 'top',
    skipIfTargetMissing: true,
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
    skipIfTargetMissing: true,
  },
  {
    id: 'review-tab',
    featureKey: 'assistant',
    target: '[data-testid="tab-review"]',
    title: 'Style & Vocabulary Review',
    body: 'The Review tab offers vocabulary and style suggestions to make your writing clearer and more compelling.',
    placement: 'bottom',
    sideEffect: 'openAssistant',
    skipIfTargetMissing: true,
  },
  {
    id: 'story-tab',
    featureKey: 'assistant',
    target: '[data-testid="tab-story"]',
    title: 'Story Arc Feedback',
    body: 'The Story tab analyses pacing and plot structure, giving you high-level feedback on your narrative.',
    placement: 'bottom',
    sideEffect: 'openAssistant',
    skipIfTargetMissing: true,
  },
  {
    id: 'coach-tab',
    featureKey: 'assistant',
    target: '[data-testid="tab-coach"]',
    title: 'Writing Coach',
    body: 'Chat directly with your AI writing coach. Ask questions, brainstorm plot points, or get feedback on any aspect of your work.',
    placement: 'bottom',
    sideEffect: 'openAssistant',
    skipIfTargetMissing: true,
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
    skipIfTargetMissing: true,
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
    skipIfTargetMissing: true,
  },
  // 10. Focus Mode (desktop header only)
  {
    id: 'focus-mode',
    featureKey: 'focusMode',
    target: '[data-testid="btn-toggle-focus-mode"]',
    title: 'Focus Mode',
    body: 'Focus Mode hides the AI sidebar so you can write without distractions. Grammar analysis is paused while active. Click again to return to normal view.',
    placement: 'bottom',
    skipIfTargetMissing: true,
  },
  // 11. Export (desktop only)
  {
    id: 'export-menu',
    featureKey: 'export',
    target: '[data-testid="btn-export-menu"]',
    title: 'Export Your Work',
    body: 'Click Export to download your document as a plain-text .txt file that you can open in any editor.',
    placement: 'bottom',
    skipIfTargetMissing: true,
  },
  // 12. Google Docs (desktop only)
  {
    id: 'gdocs-import',
    featureKey: 'googleDocs',
    target: '[data-testid="btn-import-gdocs"]',
    title: 'Import from Google Docs',
    body: 'Import an existing Google Doc directly into Lumina, or export your work back to Google Docs at any time.',
    placement: 'bottom',
    skipIfTargetMissing: true,
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
};

export const TOUR_LABELS: Record<TourKey, string> = {
  full: 'Full tour',
  focusMode: 'Focus Mode',
  scratchpad: 'Ideas Scratchpad',
  assistant: 'Creative Assistant',
  chapters: 'Chapters',
  googleDocs: 'Google Docs',
  export: 'Export',
};

const STORAGE_KEY = 'lumina_tutorial_done';
const FIRST_USE_KEY = 'lumina_first_use';

export function getTutorialDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setTutorialDone(key: string): void {
  const done = getTutorialDone();
  done[key] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
}

export function getFirstUse(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FIRST_USE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setFirstUseSeen(key: string): void {
  const seen = getFirstUse();
  seen[key] = true;
  localStorage.setItem(FIRST_USE_KEY, JSON.stringify(seen));
}

/**
 * Clears all stored tutorial progress so that the full tour auto-launches
 * again on next load and all contextual first-use prompts re-fire.
 */
export function resetTourProgress(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(FIRST_USE_KEY);
}
