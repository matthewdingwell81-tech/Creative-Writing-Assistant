import React, { useEffect, useRef, useCallback, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Mic, MicOff, Cloud, Loader2 } from 'lucide-react';
import { useDictation, normalizeDictation, type DictationEngine } from '@/hooks/useDictation';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DICTATION_ENGINE_STORAGE_KEY = 'lumina:dictation-engine';
const DICTATION_LANG_STORAGE_KEY = 'lumina:dictation-lang';

const DICTATION_LANGUAGES: { value: string; label: string }[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'es-MX', label: 'Spanish (Mexico)' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'pt-PT', label: 'Portuguese (Portugal)' },
  { value: 'nl-NL', label: 'Dutch' },
  { value: 'pl-PL', label: 'Polish' },
  { value: 'ru-RU', label: 'Russian' },
  { value: 'tr-TR', label: 'Turkish' },
  { value: 'ar-SA', label: 'Arabic' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'zh-CN', label: 'Mandarin (Simplified)' },
  { value: 'zh-TW', label: 'Mandarin (Traditional)' },
];

const DICTATION_LANG_VALUES = new Set(DICTATION_LANGUAGES.map((l) => l.value));

function getDefaultDictationLang(): string {
  if (typeof navigator !== 'undefined' && navigator.language) {
    if (DICTATION_LANG_VALUES.has(navigator.language)) return navigator.language;
    const prefix = navigator.language.split('-')[0];
    const match = DICTATION_LANGUAGES.find((l) => l.value.startsWith(prefix + '-'));
    if (match) return match.value;
  }
  return 'en-US';
}

export interface GrammarHighlight {
  original: string;
  alternatives: string[];
  id: string;
}

export interface EditorHandle {
  scrollToSuggestion: (text: string) => void;
  getCleanContent: () => string;
}

interface EditorProps {
  content: string;
  setContent: (content: string) => void;
  title: string;
  setTitle: (title: string) => void;
  onSelectionChange?: (selectedText: string) => void;
  grammarHighlights?: GrammarHighlight[];
  onApplyCorrection?: (original: string, replacement: string) => void;
}

interface PopoverState {
  visible: boolean;
  x: number;
  y: number;
  original: string;
  alternatives: string[];
  targetSpan: HTMLElement | null;
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({
  content, setContent, title, setTitle, onSelectionChange,
  grammarHighlights = [], onApplyCorrection
}, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const isInternalUpdate = useRef(false);
  const lastHighlightKey = useRef('');
  const isTyping = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grammarHighlightsRef = useRef<GrammarHighlight[]>(grammarHighlights);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashedSpellElemRef = useRef<HTMLElement | null>(null);
  const [isTypingState, setIsTypingState] = useState(false);
  const [popover, setPopover] = useState<PopoverState>({ visible: false, x: 0, y: 0, original: '', alternatives: [], targetSpan: null });
  const interimSpanRef = useRef<HTMLSpanElement | null>(null);
  const dictationCaretRef = useRef<{ node: Node; offset: number } | null>(null);
  const { toast } = useToast();

  grammarHighlightsRef.current = grammarHighlights;

  const highlightKey = useMemo(() => {
    return grammarHighlights.map(h => h.id).sort().join(',');
  }, [grammarHighlights]);

  useImperativeHandle(ref, () => ({
    getCleanContent: () => {
      if (!editorRef.current) return '';
      const clone = editorRef.current.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[data-spell-highlight]').forEach(span => {
        const parent = span.parentNode;
        if (parent) {
          const text = document.createTextNode(span.textContent || '');
          parent.replaceChild(text, span);
          parent.normalize();
        }
      });
      clone.querySelectorAll('[data-dictation-interim]').forEach(span => {
        span.parentNode?.removeChild(span);
      });
      return clone.innerHTML;
    },
    scrollToSuggestion: (text: string) => {
      if (!editorRef.current || !text) return;
      const el = editorRef.current;
      const normalizeSpaces = (s: string) => s.replace(/\u00A0/g, ' ');
      const searchLower = normalizeSpaces(text).toLowerCase();
      const FLASH_DURATION = 1800;

      // Cancel any in-flight flash and clean up stale flash spans immediately
      if (flashTimeoutRef.current !== null) {
        clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = null;
      }

      // Remove the animation class from the previously flashed spell-highlight element
      if (flashedSpellElemRef.current) {
        flashedSpellElemRef.current.classList.remove('suggestion-flash');
        flashedSpellElemRef.current = null;
      }

      // Remove any stale data-jump-flash spans, restoring their text content
      el.querySelectorAll('[data-jump-flash]').forEach(span => {
        if (span.parentNode) {
          const textReplace = document.createTextNode(span.textContent || '');
          span.parentNode.replaceChild(textReplace, span);
          span.parentNode.normalize();
        }
      });

      const startFlashOnSpellElem = (elem: HTMLElement) => {
        elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Force a reflow so the browser treats this as a fresh animation start
        elem.classList.remove('suggestion-flash');
        void elem.offsetWidth;
        elem.classList.add('suggestion-flash');
        flashedSpellElemRef.current = elem;
        flashTimeoutRef.current = setTimeout(() => {
          elem.classList.remove('suggestion-flash');
          flashedSpellElemRef.current = null;
          flashTimeoutRef.current = null;
        }, FLASH_DURATION);
      };

      // Check existing data-spell-highlight spans first
      const spellSpans = el.querySelectorAll('[data-spell-highlight]');
      for (const span of Array.from(spellSpans)) {
        const spanText = normalizeSpaces(span.textContent || '').toLowerCase();
        if (spanText === searchLower || spanText.includes(searchLower)) {
          startFlashOnSpellElem(span as HTMLElement);
          return;
        }
      }

      // Fall back to TreeWalker on text nodes
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const textNode = node as Text;
        const parentEl = textNode.parentElement as HTMLElement | null;
        if (parentEl?.hasAttribute('data-spell-highlight')) continue;
        if (parentEl?.hasAttribute('data-jump-flash')) continue;

        const nodeText = textNode.textContent || '';
        const normalizedNodeText = normalizeSpaces(nodeText);
        const idx = normalizedNodeText.toLowerCase().indexOf(searchLower);
        if (idx === -1) continue;

        try {
          const range = document.createRange();
          range.setStart(textNode, idx);
          range.setEnd(textNode, idx + text.length);

          const flashSpan = document.createElement('span');
          flashSpan.setAttribute('data-jump-flash', 'true');
          range.surroundContents(flashSpan);
          flashSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
          flashSpan.classList.add('suggestion-flash');

          flashTimeoutRef.current = setTimeout(() => {
            if (flashSpan.parentNode) {
              const textReplace = document.createTextNode(flashSpan.textContent || '');
              flashSpan.parentNode.replaceChild(textReplace, flashSpan);
              flashSpan.parentNode.normalize();
            }
            flashTimeoutRef.current = null;
            lastHighlightKey.current = '';
            if (editorRef.current) {
              clearHighlights(editorRef.current);
              applyHighlights(editorRef.current, grammarHighlightsRef.current);
              lastHighlightKey.current = grammarHighlightsRef.current.map(h => h.id).sort().join(',');
            }
          }, FLASH_DURATION);
        } catch {
          if (parentEl) startFlashOnSpellElem(parentEl);
        }
        break;
      }
    }
  }));

  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      if (editorRef.current.innerHTML !== content) {
        editorRef.current.innerHTML = content;
        lastHighlightKey.current = '';
      }
    }
    isInternalUpdate.current = false;
  }, [content]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (isTypingState) return;
    if (highlightKey === lastHighlightKey.current) return;

    const el = editorRef.current;
    clearHighlights(el);

    if (grammarHighlights.length > 0) {
      applyHighlights(el, grammarHighlights);
    }

    lastHighlightKey.current = highlightKey;
  }, [highlightKey, grammarHighlights, isTypingState]);

  // Single selectionchange listener that both:
  //   1. Reports the selected text to the parent (for toolbar/context features), and
  //   2. Keeps dictationCaretRef up to date so dictation always inserts at the
  //      user's actual cursor rather than defaulting to end-of-document.
  useEffect(() => {
    const handleSelectionChange = () => {
      if (!editorRef.current) return;
      const selection = window.getSelection();

      // --- Dictation caret tracking (always runs) ---
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (editorRef.current.contains(range.startContainer)) {
          dictationCaretRef.current = { node: range.startContainer, offset: range.startOffset };
        }
      }

      // --- Selected-text reporting (only when parent opted in) ---
      if (onSelectionChange) {
        if (!selection || selection.isCollapsed) {
          onSelectionChange('');
          return;
        }
        if (
          selection.anchorNode && editorRef.current.contains(selection.anchorNode) &&
          selection.focusNode && editorRef.current.contains(selection.focusNode)
        ) {
          onSelectionChange(selection.toString().trim());
        } else {
          onSelectionChange('');
        }
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [onSelectionChange]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popover.visible) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-spell-popover]') && !target.closest('[data-spell-highlight]')) {
          setPopover(prev => ({ ...prev, visible: false }));
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [popover.visible]);

  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-spell-highlight')) {
      const original = target.getAttribute('data-spell-original') || '';
      const alts = target.getAttribute('data-spell-alternatives') || '';
      const rect = target.getBoundingClientRect();
      const containerEl = editorRef.current?.closest('.relative');
      const containerRect = containerEl?.getBoundingClientRect();

      setPopover({
        visible: true,
        x: rect.left - (containerRect?.left || 0),
        y: rect.bottom - (containerRect?.top || 0) + 4,
        original,
        alternatives: alts ? alts.split('|||') : [],
        targetSpan: target,
      });
    }
  }, []);

  const handleApplyCorrection = useCallback((original: string, replacement: string) => {
    const span = popover.targetSpan;
    if (span && editorRef.current && editorRef.current.contains(span)) {
      const textNode = document.createTextNode(replacement);
      span.parentNode?.replaceChild(textNode, span);
      textNode.parentNode?.normalize();

      clearHighlights(editorRef.current);

      isInternalUpdate.current = true;
      const newHtml = editorRef.current.innerHTML;
      setContent(newHtml);

      if (onApplyCorrection) {
        onApplyCorrection(original, replacement);
      }
    } else if (onApplyCorrection) {
      onApplyCorrection(original, replacement);
    }

    setPopover(prev => ({ ...prev, visible: false, targetSpan: null }));
    lastHighlightKey.current = '';
  }, [popover.targetSpan, onApplyCorrection, setContent]);

  const stripInterimFromHtml = useCallback((html: string) => {
    if (!html.includes('data-dictation-interim')) return html;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('[data-dictation-interim]').forEach(s => s.parentNode?.removeChild(s));
    return tmp.innerHTML;
  }, []);

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    isInternalUpdate.current = true;
    isTyping.current = true;
    setIsTypingState(true);

    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      isTyping.current = false;
      lastHighlightKey.current = '';
      setIsTypingState(false);
    }, 1500);

    const el = e.currentTarget;
    clearHighlights(el);
    // Strip any in-flight dictation interim spans before persisting so they never get saved.
    setContent(stripInterimFromHtml(el.innerHTML));
  }, [setContent, stripInterimFromHtml]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '    ');
    }
  }, []);

  const removeInterimSpan = useCallback(() => {
    const span = interimSpanRef.current;
    if (span && span.parentNode) {
      span.parentNode.removeChild(span);
    }
    interimSpanRef.current = null;
  }, []);

  const captureCaret = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return false;
    const range = sel.getRangeAt(0);
    if (!editorRef.current.contains(range.startContainer)) return false;
    dictationCaretRef.current = { node: range.startContainer, offset: range.startOffset };
    return true;
  }, []);

  // Save the caret position when the editor loses focus so we can restore it
  // when dictation starts after the user clicks the mic button.
  const handleEditorBlur = useCallback(() => {
    captureCaret();
  }, [captureCaret]);

  const restoreCaretToEnd = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    dictationCaretRef.current = { node: range.startContainer, offset: range.startOffset };
  }, []);

  const insertTextAtCaret = useCallback((text: string) => {
    const el = editorRef.current;
    if (!el || !text) return;

    removeInterimSpan();

    // Make sure focus + caret are inside the editor before issuing editing commands so they
    // participate in the contenteditable's native undo/redo stack.
    if (document.activeElement !== el) {
      el.focus();
    }

    const stored = dictationCaretRef.current;
    const sel = window.getSelection();
    if (stored && sel && el.contains(stored.node)) {
      const range = document.createRange();
      const safeOffset = Math.min(stored.offset, (stored.node.nodeType === Node.TEXT_NODE
        ? (stored.node as Text).length
        : stored.node.childNodes.length));
      try {
        range.setStart(stored.node, safeOffset);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        restoreCaretToEnd();
      }
    } else {
      restoreCaretToEnd();
    }

    // Insert via execCommand so the change appears in the browser's undo history,
    // matching the behaviour of regular typing. Split into text runs and break markers
    // so we can map "\n\n" -> paragraph break, "\n" -> line break.
    const tokens = text.split(/(\n\n+|\n)/);
    for (const token of tokens) {
      if (!token) continue;
      if (token === '\n') {
        // insertHTML with a <br> is undoable in Chromium/WebKit/Firefox contenteditable
        document.execCommand('insertHTML', false, '<br>');
      } else if (/^\n\n+$/.test(token)) {
        document.execCommand('insertParagraph');
      } else {
        document.execCommand('insertText', false, token);
      }
    }

    // Update our caret tracking to wherever the selection ended up after the edits
    const newSel = window.getSelection();
    if (newSel && newSel.rangeCount > 0) {
      const r = newSel.getRangeAt(0);
      if (el.contains(r.startContainer)) {
        dictationCaretRef.current = { node: r.startContainer, offset: r.startOffset };
      }
    }

    isInternalUpdate.current = true;
    isTyping.current = true;
    setIsTypingState(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      isTyping.current = false;
      lastHighlightKey.current = '';
      setIsTypingState(false);
    }, 1500);

    setContent(stripInterimFromHtml(el.innerHTML));
  }, [removeInterimSpan, restoreCaretToEnd, setContent, stripInterimFromHtml]);

  const renderInterim = useCallback((text: string) => {
    const el = editorRef.current;
    if (!el) return;

    // Remove any existing interim span
    removeInterimSpan();

    if (!text) return;

    // Place a styled inline span at the stored caret position so the user sees their words live.
    const stored = dictationCaretRef.current;
    if (!stored || !el.contains(stored.node)) {
      restoreCaretToEnd();
    }
    const sel = window.getSelection();
    if (!sel) return;

    const current = dictationCaretRef.current;
    if (!current) return;

    const range = document.createRange();
    const safeOffset = Math.min(current.offset, (current.node.nodeType === Node.TEXT_NODE
      ? (current.node as Text).length
      : current.node.childNodes.length));
    try {
      range.setStart(current.node, safeOffset);
      range.collapse(true);
    } catch {
      return;
    }

    const span = document.createElement('span');
    span.setAttribute('data-dictation-interim', 'true');
    span.style.opacity = '0.55';
    span.style.fontStyle = 'italic';
    span.style.color = 'rgb(124, 58, 237)';
    span.textContent = ' ' + text;
    range.insertNode(span);
    interimSpanRef.current = span;
  }, [removeInterimSpan, restoreCaretToEnd]);

  const [dictationEngine, setDictationEngine] = useState<DictationEngine>(() => {
    if (typeof window === 'undefined') return 'auto';
    try {
      const stored = window.localStorage.getItem(DICTATION_ENGINE_STORAGE_KEY);
      if (stored === 'web-speech' || stored === 'whisper' || stored === 'auto') return stored;
    } catch { /* ignore */ }
    return 'auto';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DICTATION_ENGINE_STORAGE_KEY, dictationEngine);
    } catch { /* ignore */ }
  }, [dictationEngine]);

  const [dictationLang, setDictationLang] = useState<string>(() => {
    if (typeof window === 'undefined') return getDefaultDictationLang();
    try {
      const stored = window.localStorage.getItem(DICTATION_LANG_STORAGE_KEY);
      if (stored && DICTATION_LANG_VALUES.has(stored)) return stored;
    } catch { /* ignore */ }
    return getDefaultDictationLang();
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DICTATION_LANG_STORAGE_KEY, dictationLang);
    } catch { /* ignore */ }
  }, [dictationLang]);

  const dictation = useDictation({
    engine: dictationEngine,
    lang: dictationLang,
    onStart: () => {
      const el = editorRef.current;
      if (el) {
        if (!el.contains(document.activeElement)) {
          el.focus();
        }
        // captureCaret() will return false when the active element has already
        // moved away from the editor (e.g. the mic button took focus). In that
        // case, restore the selection to the last position tracked via
        // selectionchange / onBlur rather than jumping to end-of-document.
        if (!captureCaret()) {
          const stored = dictationCaretRef.current;
          if (stored && el.contains(stored.node)) {
            const sel = window.getSelection();
            if (sel) {
              try {
                const range = document.createRange();
                const safeOffset = Math.min(
                  stored.offset,
                  stored.node.nodeType === Node.TEXT_NODE
                    ? (stored.node as Text).length
                    : stored.node.childNodes.length
                );
                range.setStart(stored.node, safeOffset);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              } catch {
                restoreCaretToEnd();
              }
            }
          } else {
            restoreCaretToEnd();
          }
        }
      }
    },
    onInterimTranscript: (text) => {
      const { text: normalized } = normalizeDictation(text);
      // Strip trailing newlines from interim preview so it doesn't jump around
      renderInterim(normalized.replace(/\n+/g, ' ').trim());
    },
    onFinalTranscript: (text) => {
      removeInterimSpan();
      const { text: normalized } = normalizeDictation(text);
      // Add a leading space if there isn't one already and there's text before the caret
      let toInsert = normalized;
      const stored = dictationCaretRef.current;
      if (stored && stored.node.nodeType === Node.TEXT_NODE) {
        const before = (stored.node as Text).textContent?.slice(0, stored.offset) || '';
        const lastChar = before.slice(-1);
        if (lastChar && !/\s/.test(lastChar) && !/^[\s.,;:!?)\]\n]/.test(toInsert)) {
          toInsert = ' ' + toInsert;
        }
      }
      // Capitalize the first letter if previous content ends a sentence (or buffer is empty)
      // but only when the cursor is NOT in the middle of existing text (mid-sentence insertion).
      const stored2 = dictationCaretRef.current;
      if (stored2) {
        const beforeText = stored2.node.nodeType === Node.TEXT_NODE
          ? (stored2.node as Text).textContent?.slice(0, stored2.offset) || ''
          : '';
        const trimmedBefore = beforeText.replace(/\s+$/, '');
        const endsSentence = trimmedBefore === '' || /[.!?]\s*$/.test(beforeText) || /\n\s*$/.test(beforeText);

        // Check whether there is text after the cursor — if so, the cursor is mid-sentence
        // and we should not auto-capitalize regardless of what precedes it.
        // Use a Range from the caret to the end of the editor so nested DOM shapes
        // (e.g. grammar-highlight spans, element-node carets) are handled correctly.
        let hasTextAfterCursor = false;
        if (editorRef.current) {
          try {
            const afterRange = document.createRange();
            afterRange.setStart(stored2.node, stored2.offset);
            afterRange.setEnd(editorRef.current, editorRef.current.childNodes.length);
            hasTextAfterCursor = /\S/.test(afterRange.toString());
          } catch {
            // If range creation fails for any reason, fall back to conservative behaviour
            // (treat as mid-sentence to avoid spurious capitalisation).
            hasTextAfterCursor = true;
          }
        }

        if (endsSentence && !hasTextAfterCursor) {
          toInsert = toInsert.replace(/^(\s*)([a-z])/, (_m, ws, ch) => ws + ch.toUpperCase());
        }
      }
      insertTextAtCaret(toInsert);
    },
    onError: (err) => {
      removeInterimSpan();
      if (err.kind === 'unsupported') {
        toast({
          title: 'Voice dictation not supported',
          description:
            'Your browser cannot record audio. Try a recent version of Chrome, Edge, Firefox, or Safari.',
          variant: 'destructive',
        });
      } else if (err.kind === 'transcription-failed') {
        toast({
          title: 'Transcription failed',
          description: err.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Dictation stopped',
          description: err.message,
          variant: 'destructive',
        });
      }
    },
    onEnd: () => {
      removeInterimSpan();
    },
  });

  // Treat the brief mic-permission/setup window ('starting') as busy too, so
  // the button surfaces a spinner and rapid repeated clicks/shortcuts can't
  // re-trigger getUserMedia.
  const dictationBusy =
    dictation.status === 'starting' ||
    dictation.status === 'uploading' ||
    dictation.status === 'transcribing';

  const handleMicClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // While uploading/transcribing, treat a click as "cancel" — the hook's
    // stop() aborts any in-flight request and suppresses late results.
    if (dictationBusy) {
      dictation.stop();
      return;
    }
    if (!dictation.listening) {
      // Capture the current caret. If captureCaret() fails (e.g. focus has
      // already left the editor), keep whatever position was saved by the
      // continuous selectionchange / onBlur tracking instead of overwriting it
      // with the end of the document. Only fall back to end-of-document when
      // there is genuinely no stored position at all.
      if (!captureCaret() && !dictationCaretRef.current) {
        restoreCaretToEnd();
      }
    }
    dictation.toggle();
  }, [dictation, dictationBusy, captureCaret, restoreCaretToEnd]);

  const handleMicMouseDown = useCallback((e: React.MouseEvent) => {
    // Prevent the editor from losing its caret when the mic button is pressed
    e.preventDefault();
    captureCaret();
  }, [captureCaret]);

  // Global keyboard shortcut: Cmd/Ctrl+Shift+M to toggle dictation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        // Only toggle when focus is in the editor or no input/contenteditable is focused
        const active = document.activeElement as HTMLElement | null;
        const isInOtherInput = !!(active &&
          active !== editorRef.current &&
          !editorRef.current?.contains(active) &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable));
        if (isInOtherInput) return;
        // Match the button's disabled rules: ignore the shortcut while
        // the previous session is uploading/transcribing.
        if (dictationBusy) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        if (!dictation.listening) {
          if (!captureCaret() && !dictationCaretRef.current) {
            restoreCaretToEnd();
          }
        }
        dictation.toggle();
      } else if (e.key === 'Escape' && (dictation.listening || dictationBusy)) {
        // Esc is the universal "stop/cancel" — works during recording,
        // uploading, and transcribing.
        dictation.stop();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dictation, dictationBusy, captureCaret, restoreCaretToEnd]);

  // Strip stray dictation interim spans from saved content
  useEffect(() => {
    if (!editorRef.current) return;
    const interimSpans = editorRef.current.querySelectorAll('[data-dictation-interim]');
    interimSpans.forEach(s => s.parentNode?.removeChild(s));
  }, [content]);

  return (
    <div className="relative">
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full text-4xl font-serif font-medium text-foreground mb-8 bg-transparent border-none outline-none placeholder:text-muted-foreground/40"
        placeholder="Untitled"
        data-testid="input-title"
      />

      <div className="sticky top-0 z-30 -mx-2 mb-3 flex items-center justify-between gap-2 bg-background/80 backdrop-blur px-2 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onMouseDown={handleMicMouseDown}
            onClick={handleMicClick}
            disabled={!dictation.supported}
            title={
              !dictation.supported
                ? 'Voice dictation is not supported in this browser.'
                : dictationBusy
                  ? dictation.status === 'starting'
                    ? 'Waiting for microphone permission… Click or press Esc to cancel (takes effect once the browser prompt closes)'
                    : dictation.status === 'uploading'
                      ? 'Click or press Esc to cancel upload'
                      : 'Click or press Esc to cancel transcription'
                  : dictation.listening
                    ? dictation.activeEngine === 'whisper'
                      ? 'Stop recording'
                      : 'Stop dictation (Esc)'
                    : 'Start voice dictation (Cmd/Ctrl+Shift+M)'
            }
            aria-label={
              dictationBusy
                ? 'Cancel voice dictation'
                : dictation.listening
                  ? 'Stop voice dictation'
                  : 'Start voice dictation'
            }
            aria-pressed={dictation.listening || dictationBusy}
            aria-disabled={!dictation.supported}
            className={`relative inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
              dictation.listening
                ? 'border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/15'
                : dictationBusy
                  ? 'border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15'
                  : 'border-border bg-background hover:bg-accent text-foreground/80'
            } ${!dictation.supported ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            data-testid="button-dictation"
          >
            {dictationBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span data-testid="text-dictation-status">
                  {dictation.status === 'starting'
                    ? 'Starting…'
                    : dictation.status === 'uploading'
                      ? 'Uploading…'
                      : 'Transcribing…'}
                </span>
              </>
            ) : dictation.listening ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
                </span>
                <Mic className="h-4 w-4" />
                <span data-testid="text-dictation-status">
                  {dictation.activeEngine === 'whisper' ? 'Recording…' : 'Listening…'}
                </span>
              </>
            ) : (
              <>
                {dictation.supported ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                <span>Dictate</span>
              </>
            )}
          </button>

          {dictation.supported && (
            <Select
              value={dictationLang}
              onValueChange={(v) => {
                if (dictation.listening || dictationBusy) return;
                setDictationLang(v);
              }}
              disabled={dictation.listening || dictationBusy}
            >
              <SelectTrigger
                className="h-8 w-[140px] text-xs rounded-full"
                title="Choose dictation language"
                aria-label="Dictation language"
                data-testid="select-dictation-language"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DICTATION_LANGUAGES.map((l) => (
                  <SelectItem
                    key={l.value}
                    value={l.value}
                    data-testid={`option-dictation-language-${l.value}`}
                  >
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {dictation.whisperSupported && (
            dictation.webSpeechSupported ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (dictation.listening || dictationBusy) return;
                  setDictationEngine((prev) => (prev === 'whisper' ? 'web-speech' : 'whisper'));
                }}
                disabled={dictation.listening || dictationBusy}
                title={
                  dictation.activeEngine === 'whisper'
                    ? 'Cloud transcription is on. Click to switch back to your browser.'
                    : 'Use cloud transcription (higher accuracy, works in any browser).'
                }
                aria-pressed={dictation.activeEngine === 'whisper'}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  dictation.activeEngine === 'whisper'
                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-700'
                    : 'border-border bg-background hover:bg-accent text-foreground/70'
                } ${dictation.listening || dictationBusy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                data-testid="button-dictation-engine"
              >
                <Cloud className="h-3.5 w-3.5" />
                <span>{dictation.activeEngine === 'whisper' ? 'Cloud' : 'Cloud off'}</span>
              </button>
            ) : (
              // Web Speech is unavailable in this browser — Whisper is the only
              // option, so render a non-interactive badge instead of a disabled
              // toggle (no false implication of being clickable).
              <span
                title="Your browser does not support built-in dictation, so cloud transcription is always used."
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-700"
                data-testid="badge-dictation-engine"
                aria-label="Cloud transcription enabled"
              >
                <Cloud className="h-3.5 w-3.5" />
                <span>Cloud</span>
              </span>
            )
          )}
        </div>

        {(dictation.listening || dictationBusy) && (
          <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-dictation-hint">
            {dictation.status === 'starting'
              ? 'Waiting for microphone permission… (cancel takes effect once the prompt closes)'
              : dictationBusy
                ? 'Sending your audio for high-accuracy transcription…'
                : dictation.activeEngine === 'whisper'
                  ? 'Recording. Press Esc or click the mic to stop and transcribe.'
                  : 'Press Esc to stop. Try saying "period", "comma", or "new paragraph".'}
          </span>
        )}
      </div>

      <div
        ref={editorRef}
        className="prose prose-lg prose-neutral max-w-none font-serif text-foreground/85 leading-relaxed focus:outline-none min-h-[60vh] pb-32"
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        onBlur={handleEditorBlur}
        spellCheck="false"
        data-testid="editor-area"
        data-placeholder="Start writing..."
      />

      {popover.visible && popover.alternatives.length > 0 && (
        <div
          data-spell-popover="true"
          className="absolute z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px] animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ left: popover.x, top: popover.y }}
          data-testid="spell-correction-popover"
        >
          <div className="px-3 py-1.5 border-b border-border/50">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Corrections</span>
          </div>
          {popover.alternatives.map((alt, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
              onClick={() => handleApplyCorrection(popover.original, alt)}
              data-testid={`btn-correction-${i}`}
            >
              <span className="text-primary font-medium">{alt}</span>
            </button>
          ))}
          <div className="border-t border-border/50 mt-0.5">
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
              onClick={() => setPopover(prev => ({ ...prev, visible: false }))}
              data-testid="btn-dismiss-correction"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default Editor;

function clearHighlights(el: HTMLElement) {
  const spans = el.querySelectorAll('[data-spell-highlight]');
  spans.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      const text = document.createTextNode(span.textContent || '');
      parent.replaceChild(text, span);
      parent.normalize();
    }
  });
}

function applyHighlights(el: HTMLElement, highlights: GrammarHighlight[]) {
  if (highlights.length === 0) return;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  const normalizeSpaces = (s: string) => s.replace(/\u00A0/g, ' ');

  for (const highlight of highlights) {
    const searchText = highlight.original;
    if (!searchText) continue;

    const searchLower = normalizeSpaces(searchText).toLowerCase();

    for (let i = 0; i < textNodes.length; i++) {
      const textNode = textNodes[i];
      if (!textNode.parentNode) continue;
      if ((textNode.parentNode as HTMLElement).hasAttribute?.('data-spell-highlight')) continue;

      const nodeText = textNode.textContent || '';
      const normalizedNodeText = normalizeSpaces(nodeText);
      const idx = normalizedNodeText.toLowerCase().indexOf(searchLower);
      if (idx === -1) continue;

      const beforeBoundary = idx === 0 || /\W/.test(nodeText[idx - 1]);
      const afterBoundary = (idx + searchText.length) >= nodeText.length || /\W/.test(nodeText[idx + searchText.length]);
      if (!beforeBoundary || !afterBoundary) continue;

      const range = document.createRange();
      range.setStart(textNode, idx);
      range.setEnd(textNode, idx + searchText.length);

      const span = document.createElement('span');
      span.setAttribute('data-spell-highlight', 'true');
      span.setAttribute('data-spell-original', nodeText.slice(idx, idx + searchText.length));
      span.setAttribute('data-spell-alternatives', highlight.alternatives.join('|||'));
      span.style.backgroundColor = 'rgba(239, 68, 68, 0.35)';
      span.style.borderRadius = '3px';
      span.style.padding = '1px 0';
      span.style.cursor = 'pointer';

      range.surroundContents(span);

      const afterNode = span.nextSibling;
      if (afterNode && afterNode.nodeType === Node.TEXT_NODE) {
        const existingIdx = textNodes.indexOf(textNode);
        if (existingIdx !== -1) {
          textNodes.splice(existingIdx, 1, afterNode as Text);
        }
      }

      break;
    }
  }
}
