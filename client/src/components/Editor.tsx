import React, { useEffect, useRef } from 'react';

interface EditorProps {
  content: string;
  setContent: (content: string) => void;
}

export default function Editor({ content, setContent }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Initialize with some placeholder text if empty
  useEffect(() => {
    if (editorRef.current && !content) {
      const initialContent = `
        <h1 class="text-4xl font-serif font-medium text-foreground mb-6 focus:outline-none" data-placeholder="Chapter Title">The Silent Echo</h1>
        <p class="text-lg text-foreground/80 leading-relaxed font-serif mb-4 focus:outline-none" data-placeholder="Start writing your story...">The old grandfather clock in the hallway chimed three times. Elara looked up from her teacup, her eyes drawn to the dust motes dancing in the pale moonlight that filtered through the stained glass window.</p>
        <p class="text-lg text-foreground/80 leading-relaxed font-serif mb-4 focus:outline-none" data-placeholder="">It had been years since she last visited the manor. Everything felt exactly the same, yet entirely different. The weight of unspoken memories hung heavy in the air, pressing against her chest.</p>
      `;
      editorRef.current.innerHTML = initialContent;
      setContent(initialContent); // Ensure parent state knows about initial content
    }
  }, []);

  // Sync external changes (like applying suggestions) back to the editor DOM
  useEffect(() => {
    if (editorRef.current && content !== editorRef.current.innerHTML) {
       // Save cursor position if we were focused
       const isFocused = document.activeElement === editorRef.current;
       
       editorRef.current.innerHTML = content;
       
       // Note: in a real rich text editor, restoring exact cursor position after HTML replacement is complex.
       // This is a simplified approach for the mockup.
       if (isFocused) {
          // Put cursor at end as fallback for mockup
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
       }
    }
  }, [content]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    setContent(e.currentTarget.innerHTML);
  };

  return (
    <div className="relative">
      <div 
        ref={editorRef}
        className="prose prose-lg prose-neutral max-w-none prose-p:font-serif prose-headings:font-serif focus:outline-none min-h-[60vh] pb-32"
        contentEditable
        onInput={handleInput}
        spellCheck="false"
        data-testid="editor-area"
      />
      
      {/* Subtle word count at bottom */}
      <div className="fixed bottom-6 left-1/2 -translate-x-[calc(50%+190px)] text-xs text-muted-foreground/60 font-medium tracking-wide">
        482 words
      </div>
    </div>
  );
}
