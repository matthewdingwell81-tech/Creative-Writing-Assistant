import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';

export interface GrammarHighlight {
  original: string;
  alternatives: string[];
  id: string;
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

export default function Editor({
  content, setContent, title, setTitle, onSelectionChange,
  grammarHighlights = [], onApplyCorrection
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const isInternalUpdate = useRef(false);
  const lastHighlightKey = useRef('');
  const isTyping = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popover, setPopover] = useState<PopoverState>({ visible: false, x: 0, y: 0, original: '', alternatives: [], targetSpan: null });

  const highlightKey = useMemo(() => {
    return grammarHighlights.map(h => h.id).sort().join(',');
  }, [grammarHighlights]);

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
    if (isTyping.current) return;
    if (highlightKey === lastHighlightKey.current) return;

    const el = editorRef.current;
    clearHighlights(el);

    if (grammarHighlights.length > 0) {
      applyHighlights(el, grammarHighlights);
    }

    lastHighlightKey.current = highlightKey;
  }, [highlightKey, grammarHighlights]);

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

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    isInternalUpdate.current = true;
    isTyping.current = true;

    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      isTyping.current = false;
      lastHighlightKey.current = '';
    }, 1500);

    const el = e.currentTarget;
    clearHighlights(el);
    setContent(el.innerHTML);
  }, [setContent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '    ');
    }
  }, []);

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
}

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
      span.style.textDecoration = 'underline wavy';
      span.style.textDecorationColor = 'rgba(220, 38, 38, 0.5)';
      span.style.textUnderlineOffset = '3px';
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
