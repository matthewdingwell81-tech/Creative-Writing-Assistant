import React, { useState, useMemo } from 'react';
import { useResearch, type ResearchItem } from '@/hooks/use-research';
import type { Chapter } from '@/types/schema';
import { Search, Plus, Loader2, Star, AlertCircle, Edit2, Trash2, Link as LinkIcon, Image as ImageIcon, FileText, MoreVertical, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResearchFormDialog } from './ResearchFormDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ResearchLibraryProps {
  documentId: number;
  chapters: Chapter[];
}

export function ResearchLibrary({ documentId, chapters }: ResearchLibraryProps) {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'chapter'>('all');
  const [chapterFilter, setChapterFilter] = useState<number | 'all'>('all');
  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'favorites'>('all');
  
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<ResearchItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { query, remove, update } = useResearch(documentId);

  const items = query.data || [];

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    items.forEach(item => item.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (search && !item.title.toLowerCase().includes(search.toLowerCase()) && !item.content?.toLowerCase().includes(search.toLowerCase())) return false;
      if (tagFilter !== 'all' && !item.tags?.includes(tagFilter)) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (scopeFilter === 'global' && !item.isGlobal) return false;
      if (scopeFilter === 'chapter' && item.isGlobal) return false;
      if (chapterFilter !== 'all' && !item.chapterIds?.includes(chapterFilter)) return false;
      if (favoriteFilter === 'favorites' && !item.favorite) return false;
      return true;
    });
  }, [items, search, tagFilter, typeFilter, scopeFilter, chapterFilter, favoriteFilter]);

  const toggleFavorite = (item: ResearchItem) => {
    update.mutate({ id: item.id, data: { favorite: !item.favorite } });
  };
  const toggleImportant = (item: ResearchItem) => {
    update.mutate({ id: item.id, data: { important: !item.important } });
  };

  const renderFilters = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</h4>
        <div className="space-y-1">
          {['all', 'text', 'link', 'image'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${typeFilter === t ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              data-testid={`filter-type-${t}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h4>
        <div className="space-y-1">
          <button onClick={() => setFavoriteFilter('all')} className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${favoriteFilter === 'all' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} data-testid="filter-fav-all">All Items</button>
          <button onClick={() => setFavoriteFilter('favorites')} className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${favoriteFilter === 'favorites' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} data-testid="filter-fav-favorites">Favorites Only</button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scope</h4>
        <div className="space-y-1">
          <button onClick={() => { setScopeFilter('all'); setChapterFilter('all'); }} className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${scopeFilter === 'all' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} data-testid="filter-scope-all">All Scopes</button>
          <button onClick={() => { setScopeFilter('global'); setChapterFilter('all'); }} className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${scopeFilter === 'global' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} data-testid="filter-scope-global">Global Notes</button>
          <button onClick={() => { setScopeFilter('chapter'); }} className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${scopeFilter === 'chapter' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} data-testid="filter-scope-chapter">Chapter Specific</button>
          
          {scopeFilter === 'chapter' && chapters.length > 0 && (
            <div className="pl-4 mt-1 border-l-2 border-border/50 ml-2 space-y-1">
              <button onClick={() => setChapterFilter('all')} className={`w-full text-left px-2 py-1 text-sm rounded-md transition-colors ${chapterFilter === 'all' ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`} data-testid="filter-chapter-all">Any Chapter</button>
              {chapters.map(ch => (
                <button key={ch.id} onClick={() => setChapterFilter(ch.id)} className={`w-full text-left px-2 py-1 text-sm rounded-md transition-colors truncate ${chapterFilter === ch.id ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`filter-chapter-${ch.id}`}>
                  {ch.title || 'Untitled'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags</h4>
          <div className="flex flex-wrap gap-1.5">
            <Badge 
              variant={tagFilter === 'all' ? 'default' : 'secondary'}
              className={`cursor-pointer ${tagFilter === 'all' ? '' : 'hover:bg-muted'}`}
              onClick={() => setTagFilter('all')}
              data-testid="filter-tag-all"
            >
              All
            </Badge>
            {allTags.map(tag => (
              <Badge 
                key={tag} 
                variant={tagFilter === tag ? 'default' : 'secondary'}
                className={`cursor-pointer ${tagFilter === tag ? '' : 'hover:bg-muted'}`}
                onClick={() => setTagFilter(tag)}
                data-testid={`filter-tag-${tag}`}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (query.isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground" data-testid="research-loading">
        <Loader2 className="w-6 h-6 animate-spin mb-4 text-primary" />
        <p>Loading library...</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground" data-testid="research-error">
        <AlertCircle className="w-8 h-8 mb-4 text-destructive" />
        <p>Could not load your research library.</p>
        <Button variant="outline" className="mt-4" onClick={() => query.refetch()} data-testid="btn-research-retry">Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background" data-testid="research-library">
      {/* Sidebar Filters */}
      <aside className="w-64 border-r border-border/50 bg-card/30 flex flex-col hidden md:flex shrink-0">
        <div className="p-4 border-b border-border/50">
          <Button onClick={() => { setEditItem(null); setFormOpen(true); }} className="w-full" data-testid="btn-add-research">
            <Plus className="w-4 h-4 mr-2" />
            Add Research
          </Button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {renderFilters()}
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="p-4 md:p-6 border-b border-border/50 flex gap-2 md:gap-4 items-center shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="Search research..." 
              className="pl-9 h-9"
              data-testid="input-search-research"
            />
          </div>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="md:hidden shrink-0 px-2" data-testid="btn-mobile-filters">
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader className="mb-4">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto pb-8">
                {renderFilters()}
              </div>
            </SheetContent>
          </Sheet>

          <Button onClick={() => { setEditItem(null); setFormOpen(true); }} size="sm" className="md:hidden shrink-0" data-testid="btn-add-research-mobile">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:32px_32px]">
          {filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-card border shadow-sm flex items-center justify-center mb-6">
                <Search className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-medium mb-2 font-serif text-foreground">No items found</h3>
              <p className="text-muted-foreground mb-6">
                {items.length === 0 ? "Your research library is empty. Start collecting notes, links, and inspiration." : "No research items match your current filters."}
              </p>
              {items.length === 0 && (
                <Button onClick={() => { setEditItem(null); setFormOpen(true); }} data-testid="btn-empty-add">
                  <Plus className="w-4 h-4 mr-2" /> Add First Item
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-max items-start">
              {filteredItems.map(item => (
                <Card key={item.id} className="overflow-hidden flex flex-col group hover-elevate transition-shadow" data-testid={`research-card-${item.id}`}>
                  {item.type === 'image' && item.objectPath && (
                    <div className="w-full h-32 bg-muted relative">
                      <img src={`/api/storage${item.objectPath}`} alt={item.title} className="w-full h-full object-cover" data-testid={`img-${item.id}`} />
                    </div>
                  )}
                  
                  <div className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2 font-medium leading-tight" data-testid={`title-${item.id}`}>
                        {item.type === 'text' && <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
                        {item.type === 'link' && <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />}
                        {item.type === 'image' && <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />}
                        <span className="line-clamp-2">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2">
                        {item.important && <AlertCircle className="w-4 h-4 text-destructive" data-testid={`important-${item.id}`} />}
                        {item.favorite && <Star className="w-4 h-4 text-amber-500 fill-amber-500" data-testid={`favorite-${item.id}`} />}
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 [@media(pointer:coarse)]:opacity-100" data-testid={`menu-${item.id}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditItem(item); setFormOpen(true); }} data-testid={`menu-edit-${item.id}`}>
                              <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleFavorite(item)} data-testid={`menu-favorite-${item.id}`}>
                              <Star className={`w-3.5 h-3.5 mr-2 ${item.favorite ? 'fill-amber-500 text-amber-500' : ''}`} /> {item.favorite ? 'Unfavorite' : 'Favorite'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleImportant(item)} data-testid={`menu-important-${item.id}`}>
                              <AlertCircle className={`w-3.5 h-3.5 mr-2 ${item.important ? 'text-destructive' : ''}`} /> {item.important ? 'Remove Important' : 'Mark Important'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:bg-destructive/10" onClick={() => setDeleteId(item.id)} data-testid={`menu-delete-${item.id}`}>
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    
                    {item.type === 'text' && item.content && (
                      <p className="text-sm text-muted-foreground line-clamp-4" data-testid={`content-${item.id}`}>{item.content}</p>
                    )}
                    {item.type === 'link' && item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block" data-testid={`link-${item.id}`}>
                        {item.url}
                      </a>
                    )}
                    
                    {(item.tags && item.tags.length > 0) || !item.isGlobal ? (
                      <div className="flex flex-wrap gap-1 pt-1 mt-auto">
                        {!item.isGlobal && (
                          <Badge variant="outline" className="bg-primary/5 text-[10px] uppercase font-semibold" data-testid={`badge-chapter-${item.id}`}>Chapter</Badge>
                        )}
                        {item.tags?.map(t => (
                          <Badge key={t} variant="secondary" className="text-[10px] font-medium opacity-80" data-testid={`badge-tag-${item.id}-${t}`}>{t}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <ResearchFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        documentId={documentId}
        chapters={chapters}
        mode={editItem ? 'edit' : 'create'}
        initialData={editItem}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete research item?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. It will be removed from all attached chapters.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) remove.mutate(deleteId); setDeleteId(null); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
