import React, { useState } from 'react';
import Editor from '@/components/Editor';
import SuggestionsSidebar from '@/components/SuggestionsSidebar';
import { PenTool, Sparkles, BookOpen, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [content, setContent] = useState('');
  
  // Example function to handle accepting a suggestion
  // In a real app, this would use a more robust way to target specific text nodes
  const applySuggestion = (originalText: string, newText: string) => {
    if (!content) return;
    
    // Simple string replacement for the prototype
    const updatedContent = content.replace(originalText, newText);
    setContent(updatedContent);
  };
  
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Header */}
      <header className="h-14 border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between px-6">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold tracking-tight text-lg">Lumina</span>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><BookOpen className="w-4 h-4"/> Chapter 3</span>
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">Auto-saved</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Settings className="w-4 h-4" />
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm rounded-full px-6">
            Export
          </Button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Editor Area */}
        <div className="flex-1 overflow-y-auto relative">
          <div className="max-w-3xl mx-auto px-8 py-12">
             <Editor content={content} setContent={setContent} />
          </div>
        </div>

        {/* AI Suggestions Sidebar */}
        <aside className="w-[380px] border-l border-border/50 bg-card/30 backdrop-blur flex flex-col">
           <SuggestionsSidebar onApplySuggestion={applySuggestion} />
        </aside>
      </main>
    </div>
  );
}
