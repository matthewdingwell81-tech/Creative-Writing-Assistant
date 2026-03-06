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
      editorRef.current.innerHTML = `
        <h1 class="text-4xl font-serif font-medium text-foreground mb-6 focus:outline-none" data-placeholder="Chapter Title">The Silent Echo</h1>
        <p class="text-lg text-foreground/80 leading-relaxed font-serif mb-4 focus:outline-none" data-placeholder="Start writing your story...">The old grandfather clock in the hallway chimed three times. Elara looked up from her teacup, her eyes drawn to the dust motes dancing in the pale moonlight that filtered through the stained glass window.</p>
        <p class="text-lg text-foreground/80 leading-relaxed font-serif mb-4 focus:outline-none" data-placeholder="">It had been years since she last visited the manor. Everything felt exactly the same, yet entirely different. The weight of unspoken memories hung heavy in the air, pressing against her chest.</p>
      `;
    }
  }, []);

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
