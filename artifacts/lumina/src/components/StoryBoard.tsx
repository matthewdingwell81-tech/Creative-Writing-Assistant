import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Palette, GripVertical, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Chapter } from '@/types/schema';

const CARD_COLORS = {
  lavender: 'bg-[#f4f0fa] dark:bg-[#2d2440] border-[#e6dcf2] dark:border-[#433561]',
  rose:     'bg-[#fff0f3] dark:bg-[#3d222b] border-[#ffe0e6] dark:border-[#5c3341]',
  amber:    'bg-[#fff8eb] dark:bg-[#3d311c] border-[#ffebc2] dark:border-[#5c4a2a]',
  sage:     'bg-[#f0f7f4] dark:bg-[#20362d] border-[#d8ebe1] dark:border-[#305244]',
  sky:      'bg-[#f0f7ff] dark:bg-[#1d3142] border-[#dceafe] dark:border-[#2c4a63]',
  slate:    'bg-[#f4f4f5] dark:bg-[#27272a] border-[#e4e4e7] dark:border-[#3f3f46]',
};

interface StoryBoardProps {
  chapters: Chapter[];
  activeChapterId: number | null;
  reorderSaving: boolean;
  colorSavingChapterId: number | null;
  isAdding: boolean;
  onOpenChapter: (id: number) => void;
  onAddChapter: () => void;
  onReorder: (chapterIds: number[]) => void;
  onColorChange: (id: number, color: Chapter['cardColor']) => void;
}

const getPlainText = (text?: string) => {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

const getWordCount = (text?: string) => {
  if (!text) return 0;
  return getPlainText(text).split(/\s+/).filter(Boolean).length;
};

function ColorPicker({ 
  currentColor, 
  onSelect, 
  isSaving, 
  chapterId 
}: { 
  currentColor: Chapter['cardColor']; 
  onSelect: (color: Chapter['cardColor']) => void;
  isSaving?: boolean;
  chapterId: number;
}) {
  const [open, setOpen] = useState(false);
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button 
          data-testid={`color-control-${chapterId}`}
          className={cn(
            "p-2 rounded-md text-muted-foreground/40 hover:text-foreground transition-colors outline-none",
            open ? "text-foreground bg-foreground/5" : ""
          )}
          disabled={isSaving}
          aria-label="Change card color"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 bg-popover/95 backdrop-blur shadow-xl border-border/50" align="end" sideOffset={8}>
        <div className="flex gap-2">
          {(Object.keys(CARD_COLORS) as Array<keyof typeof CARD_COLORS>).map(color => (
            <button
              key={color}
              data-testid={`color-option-${chapterId}-${color}`}
              className={cn(
                "w-8 h-8 rounded-full border shadow-sm transition-all hover:scale-110 active:scale-95 outline-none",
                CARD_COLORS[color],
                currentColor === color ? "ring-2 ring-primary ring-offset-2 ring-offset-popover scale-110" : ""
              )}
              onClick={() => {
                onSelect(color);
                setOpen(false);
              }}
              aria-label={`Select ${color}`}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ChapterCardProps {
  chapter: Chapter;
  isActive?: boolean;
  isClone?: boolean;
  isDragging?: boolean;
  isSavingColor?: boolean;
  onOpen?: () => void;
  onColorChange?: (color: Chapter['cardColor']) => void;
  onDragStart?: (e: React.PointerEvent<HTMLButtonElement>, id: number) => void;
  onDragMove?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onDragEnd?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onDragCancel?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onDragCaptureLost?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>, id: number) => void;
}

function ChapterCard({
  chapter, isActive, isClone, isDragging, isSavingColor,
  onOpen, onColorChange, onDragStart, onDragMove, onDragEnd, onDragCancel, onDragCaptureLost, onKeyDown
}: ChapterCardProps) {
  return (
    <Card 
      data-chapter-id={chapter.id}
      data-color={chapter.cardColor}
      data-testid={!isClone ? `card-${chapter.id}` : undefined}
      className={cn(
        "relative transition-all overflow-hidden flex flex-col h-[260px]", 
        CARD_COLORS[chapter.cardColor] || CARD_COLORS.slate,
        isClone ? "shadow-2xl opacity-90 ring-1 ring-primary/20 cursor-grabbing" : "hover:shadow-md",
        isDragging ? "opacity-30 border-dashed scale-95" : "",
        isActive && !isClone && !isDragging ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      )}
    >
      {isActive && !isClone && !isDragging && (
        <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
      )}
      <div 
        className="flex flex-col h-full cursor-pointer p-5 gap-3" 
        onClick={() => onOpen?.()}
        onKeyDown={(event) => {
          if (event.currentTarget === event.target && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onOpen?.();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Open ${chapter.title || 'Untitled Chapter'} in editor`}
      >
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <h3 data-testid={!isClone ? `title-${chapter.id}` : undefined} className="font-serif text-lg font-medium text-foreground truncate">
              {chapter.title || "Untitled Chapter"}
            </h3>
            <div data-testid={!isClone ? `count-${chapter.id}` : undefined} className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
              {getWordCount(chapter.content)} words
            </div>
          </div>
          
          <div className="flex items-center gap-1 -mr-2 -mt-2" onClick={e => e.stopPropagation()}>
            {onColorChange && (
              <ColorPicker 
                currentColor={chapter.cardColor} 
                onSelect={onColorChange} 
                isSaving={isSavingColor}
                chapterId={chapter.id}
              />
            )}
            {onDragStart && (
              <button 
                data-testid={!isClone ? `drag-handle-${chapter.id}` : undefined}
                className="p-2 text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
                onPointerDown={(e) => onDragStart(e, chapter.id)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragCancel}
                onLostPointerCapture={onDragCaptureLost}
                onKeyDown={(e) => onKeyDown?.(e, chapter.id)}
                aria-label="Reorder chapter"
              >
                <GripVertical className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 relative mt-2">
          <p data-testid={!isClone ? `synopsis-${chapter.id}` : undefined} className="text-sm text-muted-foreground/80 leading-relaxed line-clamp-5">
            {chapter.synopsis || <span className="italic opacity-50">No synopsis written yet.</span>}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function StoryBoard({
  chapters,
  activeChapterId,
  reorderSaving,
  colorSavingChapterId,
  isAdding,
  onOpenChapter,
  onAddChapter,
  onReorder,
  onColorChange
}: StoryBoardProps) {
  const [localChapters, setLocalChapters] = useState<Chapter[]>(chapters);
  const [dragState, setDragState] = useState<{
    id: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    rect: DOMRect;
  } | null>(null);
  const dragActiveRef = useRef(false);
  const localChaptersRef = useRef<Chapter[]>(chapters);
  
  useEffect(() => {
    // Only sync from props if we are not actively dragging
    if (!dragState) {
      localChaptersRef.current = chapters;
      setLocalChapters(chapters);
    }
  }, [chapters, dragState]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: number) => {
    if (reorderSaving) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    const cardElement = e.currentTarget.closest('[data-chapter-id]');
    if (!cardElement) return;
    
    const rect = cardElement.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragActiveRef.current = true;
    
    setDragState({
      id,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      rect
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    
    setDragState(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);

    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    const overCard = elements.find(el => el.hasAttribute('data-chapter-id'));
    
    if (overCard) {
      const overId = Number(overCard.getAttribute('data-chapter-id'));
      if (overId !== dragState.id) {
        if (!dragActiveRef.current) return;
        const current = localChaptersRef.current;
        const fromIndex = current.findIndex(c => c.id === dragState.id);
        const toIndex = current.findIndex(c => c.id === overId);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

        const next = [...current];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        localChaptersRef.current = next;
        setLocalChapters(next);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    dragActiveRef.current = false;
    setDragState(null);
    
    const newOrderIds = localChaptersRef.current.map(c => c.id);
    const oldOrderIds = chapters.map(c => c.id);
    if (newOrderIds.join(',') !== oldOrderIds.join(',')) {
      onReorder(newOrderIds);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragActiveRef.current) return;
    dragActiveRef.current = false;
    localChaptersRef.current = chapters;
    setLocalChapters(chapters);
    setDragState(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, id: number) => {
    if (reorderSaving) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      
      const current = localChaptersRef.current;
      const currentIndex = current.findIndex(c => c.id === id);
      if (currentIndex === -1) return;

      let newIndex = currentIndex;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        newIndex = Math.max(0, currentIndex - 1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        newIndex = Math.min(current.length - 1, currentIndex + 1);
      }

      if (newIndex !== currentIndex) {
        const next = [...current];
        const [moved] = next.splice(currentIndex, 1);
        next.splice(newIndex, 0, moved);
        localChaptersRef.current = next;
        setLocalChapters(next);
        onReorder(next.map(c => c.id));
      }
    }
  };

  const draggedChapter = dragState ? localChapters.find(c => c.id === dragState.id) : null;

  return (
    <div data-testid="board" className="min-h-full bg-background bg-[radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:32px_32px]">
      <div className="max-w-7xl mx-auto p-4 md:p-8 md:pt-12">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-serif font-medium tracking-tight mb-1 text-foreground">Story Board</h1>
            <p className="text-muted-foreground text-sm">Organize and visualize your manuscript</p>
          </div>
          <div className="flex items-center gap-4 self-stretch sm:self-auto">
            {reorderSaving && (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
              </span>
            )}
            <Button 
              data-testid="button-add-chapter" 
              onClick={onAddChapter} 
              disabled={isAdding}
              className="w-full sm:w-auto shadow-sm"
            >
              {isAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Chapter
            </Button>
          </div>
        </header>

        {localChapters.length === 0 ? (
          <div className="col-span-full py-24 flex flex-col items-center justify-center text-center bg-card/50 rounded-2xl border border-dashed border-border/60">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Plus className="w-8 h-8 text-primary/60" />
            </div>
            <h3 className="text-xl font-medium mb-2 font-serif">No chapters yet</h3>
            <p className="text-muted-foreground max-w-md mb-8">
              Start building your manuscript by adding your first chapter. 
              You can reorganize and color-code them later as your story grows.
            </p>
            <Button data-testid="button-add-chapter-empty" onClick={onAddChapter} size="lg" disabled={isAdding}>
              {isAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add First Chapter
            </Button>
          </div>
        ) : (
          <div data-testid="board-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {localChapters.map(chapter => (
              <ChapterCard 
                key={chapter.id}
                chapter={chapter}
                isActive={activeChapterId === chapter.id}
                isDragging={dragState?.id === chapter.id}
                isSavingColor={colorSavingChapterId === chapter.id}
                onOpen={() => onOpenChapter(chapter.id)}
                onColorChange={(color) => onColorChange(chapter.id, color)}
                onDragStart={handlePointerDown}
                onDragMove={handlePointerMove}
                onDragEnd={handlePointerUp}
                onDragCancel={handlePointerCancel}
                onDragCaptureLost={handlePointerCancel}
                onKeyDown={handleKeyDown}
              />
            ))}
          </div>
        )}

        {dragState && draggedChapter && (
          <div 
            className="fixed pointer-events-none z-50 transition-transform duration-0"
            style={{
              top: dragState.rect.top,
              left: dragState.rect.left,
              width: dragState.rect.width,
              height: dragState.rect.height,
              transform: `translate(${dragState.currentX - dragState.startX}px, ${dragState.currentY - dragState.startY}px) rotate(-3deg) scale(1.02)`,
            }}
          >
            <ChapterCard 
              chapter={draggedChapter} 
              isClone={true} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
