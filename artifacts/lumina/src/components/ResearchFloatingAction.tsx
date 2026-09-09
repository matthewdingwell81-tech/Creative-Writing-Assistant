import React, { useState } from 'react';
import { useResearch, useRelatedResearch, type ResearchItem } from '@/hooks/use-research';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BookOpen, Plus, Loader2, Link as LinkIcon, Image as ImageIcon, FileText, X, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ResearchFormDialog } from './ResearchFormDialog';
import type { Chapter } from '@/types/schema';

interface ResearchFloatingActionProps {
  documentId: number;
  chapterId: number | null;
  chapters: Chapter[];
}

export function ResearchFloatingAction({ documentId, chapterId, chapters }: ResearchFloatingActionProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'related' | 'attached' | 'all'>('related');
  const [formOpen, setFormOpen] = useState(false);

  // We query all 3 so switching tabs is instant, enabled appropriately.
  const { query: allQuery, attach, detach } = useResearch(documentId);
  const attachedQuery = useResearch(documentId, chapterId ? { chapterId, scope: 'chapter' } : undefined).query;
  const relatedQuery = useRelatedResearch(documentId, chapterId);

  const renderList = () => {
    let items: ResearchItem[] = [];
    let isLoading = false;
    let emptyMessage = '';

    if (tab === 'related') {
      items = relatedQuery.data || [];
      isLoading = relatedQuery.isLoading;
      emptyMessage = 'No related research found for this chapter content.';
    } else if (tab === 'attached') {
      items = attachedQuery.data || [];
      isLoading = attachedQuery.isLoading;
      emptyMessage = 'No research items attached directly to this chapter.';
    } else {
      items = allQuery.data || [];
      isLoading = allQuery.isLoading;
      emptyMessage = 'Your research library is empty.';
    }

    if (!chapterId && tab !== 'all') {
      return <div className="text-center text-sm text-muted-foreground mt-8">Select a chapter to see {tab} research.</div>;
    }

    if (isLoading) {
      return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="floating-loading" /></div>;
    }

    const currentQuery = tab === 'related' ? relatedQuery : tab === 'attached' ? attachedQuery : allQuery;
    if (currentQuery.isError) {
      return (
        <div className="text-center p-6 text-sm text-destructive" data-testid="floating-error">
          <p>Failed to load research items.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => currentQuery.refetch()} data-testid="btn-floating-retry">Retry</Button>
        </div>
      );
    }

    if (items.length === 0) {
      return <div className="text-center text-sm text-muted-foreground mt-8 px-4" data-testid="floating-empty">{emptyMessage}</div>;
    }

    return (
      <div className="space-y-3 p-1">
        {items.map(item => {
          const isAttached = chapterId ? item.chapterIds?.includes(chapterId) : false;
          
          return (
            <div key={item.id} className="bg-card border rounded-lg p-3 shadow-sm hover-elevate transition-shadow text-sm group" data-testid={`floating-item-${item.id}`}>
              <div className="flex gap-2 justify-between items-start mb-1.5">
                <div className="font-medium flex items-center gap-1.5 leading-tight" data-testid={`floating-title-${item.id}`}>
                  {item.type === 'text' && <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  {item.type === 'link' && <LinkIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  {item.type === 'image' && <ImageIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="line-clamp-2">{item.title}</span>
                </div>
                {chapterId && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-6 w-6 shrink-0 rounded-full transition-colors ${isAttached ? 'text-primary hover:bg-destructive/10 hover:text-destructive' : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'}`}
                    onClick={() => {
                      if (isAttached) {
                        detach.mutate({ id: item.id, chapterId });
                      } else {
                        attach.mutate({ id: item.id, chapterId });
                      }
                    }}
                    title={isAttached ? 'Detach from chapter' : 'Attach to chapter'}
                    data-testid={`btn-toggle-attach-${item.id}`}
                  >
                    {isAttached ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
              
              {item.type === 'image' && item.objectPath && (
                <div className="w-full h-24 bg-muted rounded-md overflow-hidden mb-2">
                  <img src={`/api/storage${item.objectPath}`} className="w-full h-full object-cover" alt="" data-testid={`floating-img-${item.id}`} />
                </div>
              )}
              
              {item.type === 'text' && item.content && (
                <p className="text-muted-foreground line-clamp-3 text-xs mb-2" data-testid={`floating-content-${item.id}`}>{item.content}</p>
              )}
              
              {item.type === 'link' && item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block text-xs mb-2" data-testid={`floating-link-${item.id}`}>
                  {item.url}
                </a>
              )}
              
              <div className="flex flex-wrap gap-1 mt-auto pt-1">
                {item.isGlobal && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-muted/50" data-testid={`floating-badge-global-${item.id}`}>Global</Badge>}
                {item.tags?.map(t => (
                  <Badge key={t} variant="outline" className="text-[9px] px-1 py-0 h-4 bg-background" data-testid={`floating-badge-tag-${item.id}-${t}`}>{t}</Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button 
            size="icon" 
            className="fixed bottom-6 right-6 md:right-8 lg:right-10 h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all z-40 bg-card text-foreground border hover:bg-muted md:bottom-6 bottom-[120px]"
            data-testid="fab-research"
            title="Research Library"
          >
            <BookOpen className="w-5 h-5 text-primary" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-sm p-0 flex flex-col border-l">
          <SheetHeader className="p-4 border-b shrink-0 text-left bg-card/50">
            <SheetTitle className="flex items-center gap-2 font-serif text-lg">
              <BookOpen className="w-5 h-5 text-primary" />
              Research Context
            </SheetTitle>
            <div className="flex bg-muted/50 p-1 rounded-md mt-4">
              <button onClick={() => setTab('related')} data-testid="tab-related" className={`flex-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors ${tab === 'related' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Related</button>
              <button onClick={() => setTab('attached')} data-testid="tab-attached" className={`flex-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors ${tab === 'attached' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Attached</button>
              <button onClick={() => setTab('all')} data-testid="tab-all" className={`flex-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors ${tab === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Library</button>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
            {renderList()}
          </div>
          
          <div className="p-4 border-t bg-card/50 shrink-0">
            <Button className="w-full shadow-sm" onClick={() => setFormOpen(true)} data-testid="btn-quick-add-research">
              <Plus className="w-4 h-4 mr-2" /> Quick Add Note
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ResearchFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        documentId={documentId}
        chapters={chapters}
        defaultChapterId={chapterId}
        mode="create"
      />
    </>
  );
}
