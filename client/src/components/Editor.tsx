import React, { useEffect, useRef, useCallback, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useDictation, normalizeDictation } from '@/hooks/useDictation';
import { useToast } from '@/hooks/use-toast';

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

  useEffect(() => {
    const handleSelectionChange = () => {
      if (!onSelectionChange || !editorRef.current) return;
      const selection = window.getSelection();
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

    // Restore stored caret position so dictation always inserts where the user left off,
    // even if focus moved away to click the mic button.
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

    // Split on newlines so we can insert <br> for line breaks
    const parts = text.split('\n');
    const currentSel = window.getSelection();
    if (!currentSel || currentSel.rangeCount === 0) return;
    let range = currentSel.getRangeAt(0);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part) {
        const textNode = document.createTextNode(part);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
      }
      if (i < parts.length - 1) {
        const br = document.createElement('br');
        range.insertNode(br);
        range.setStartAfter(br);
        range.setEndAfter(br);
      }
    }

    currentSel.removeAllRanges();
    currentSel.addRange(range);
    dictationCaretRef.current = { node: range.startContainer, offset: range.startOffset };

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

  const dictation = useDictation({
    onStart: () => {
      const el = editorRef.current;
      if (el) {
        if (!el.contains(document.activeElement)) {
          el.focus();
        }
        if (!captureCaret()) {
          restoreCaretToEnd();
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
      const stored2 = dictationCaretRef.current;
      if (stored2) {
        const beforeText = stored2.node.nodeType === Node.TEXT_NODE
          ? (stored2.node as Text).textContent?.slice(0, stored2.offset) || ''
          : '';
        const trimmedBefore = beforeText.replace(/\s+$/, '');
        const endsSentence = trimmedBefore === '' || /[.!?]\s*$/.test(beforeText) || /\n\s*$/.test(beforeText);
        if (endsSentence) {
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
          description: 'Try Chrome, Edge, or Safari to use this feature.',
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

  const handleMicClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dictation.listening) {
      // Capture caret BEFORE focus moves to the button
      captureCaret() || restoreCaretToEnd();
    }
    dictation.toggle();
  }, [dictation, captureCaret, restoreCaretToEnd]);

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
        e.preventDefault();
        if (!dictation.listening) {
          captureCaret() || restoreCaretToEnd();
        }
        dictation.toggle();
      } else if (e.key === 'Escape' && dictation.listening) {
        dictation.stop();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dictation, captureCaret, restoreCaretToEnd]);

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
        <button
          type="button"
          onMouseDown={handleMicMouseDown}
          onClick={handleMicClick}
          title={
            !dictation.supported
              ? 'Voice dictation not supported in this browser'
              : dictation.listening
                ? 'Stop dictation (Esc)'
                : 'Start voice dictation (Cmd/Ctrl+Shift+M)'
          }
          aria-label={dictation.listening ? 'Stop voice dictation' : 'Start voice dictation'}
          aria-pressed={dictation.listening}
          className={`relative inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
            dictation.listening
              ? 'border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/15'
              : 'border-border bg-background hover:bg-accent text-foreground/80'
          } ${!dictation.supported ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          data-testid="button-dictation"
        >
          {dictation.listening ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
              </span>
              <Mic className="h-4 w-4" />
              <span data-testid="text-dictation-status">Listening…</span>
            </>
          ) : (
            <>
              {dictation.supported ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              <span>Dictate</span>
            </>
          )}
        </button>

        {dictation.listening && (
          <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-dictation-hint">
            Press Esc to stop. Try saying "period", "comma", or "new paragraph".
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
