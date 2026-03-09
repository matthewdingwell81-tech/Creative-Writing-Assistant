import React, { useEffect, useRef, useCallback } from 'react';

interface EditorProps {
  content: string;
  setContent: (content: string) => void;
  title: string;
  setTitle: (title: string) => void;
  onSelectionChange?: (selectedText: string) => void;
}

export default function Editor({ content, setContent, title, setTitle, onSelectionChange }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      if (editorRef.current.innerHTML !== content) {
        editorRef.current.innerHTML = content;
      }
    }
    isInternalUpdate.current = false;
  }, [content]);

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

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    isInternalUpdate.current = true;
    setContent(e.currentTarget.innerHTML);
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
        spellCheck="false"
        data-testid="editor-area"
        data-placeholder="Start writing..."
      />
    </div>
  );
}
