import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchIdeas, createIdea, deleteIdea } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Lightbulb, ChevronUp, ChevronDown, X, Plus } from 'lucide-react';
import type { Idea } from '@shared/schema';

interface IdeasPanelProps {
  documentId: number;
}

export default function IdeasPanel({ documentId }: IdeasPanelProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [newIdea, setNewIdea] = useState('');

  const queryKey = [`/api/documents/${documentId}/ideas`];

  const { data: ideasList = [] } = useQuery<Idea[]>({
    queryKey,
    queryFn: () => fetchIdeas(documentId),
    enabled: expanded,
  });

  const createMutation = useMutation({
    mutationFn: (content: string) => createIdea(documentId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setNewIdea('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteIdea(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newIdea.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = newIdea.trim();
      if (!trimmed) return;
      createMutation.mutate(trimmed);
    }
  };

  return (
    <div className="border-t border-border/50 bg-card/40 backdrop-blur-sm" data-testid="ideas-panel">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        data-testid="toggle-ideas-panel"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4" />
          <span>Ideas Scratchpad</span>
          {ideasList.length > 0 && (
            <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-xs font-medium" data-testid="ideas-count">
              {ideasList.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3" data-testid="ideas-panel-content">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <textarea
              value={newIdea}
              onChange={(e) => setNewIdea(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Jot down an idea..."
              className="flex-1 min-h-[60px] max-h-[120px] resize-none rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              data-testid="input-new-idea"
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="self-end text-primary hover:bg-primary/10 shrink-0"
              disabled={!newIdea.trim() || createMutation.isPending}
              data-testid="btn-add-idea"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </form>

          {ideasList.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 text-center py-2" data-testid="ideas-empty">
              No ideas saved yet
            </p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto" data-testid="ideas-list">
              {ideasList.map((idea) => (
                <div
                  key={idea.id}
                  className="group flex items-start gap-2 rounded-md bg-background/30 border border-border/30 px-3 py-2"
                  data-testid={`idea-item-${idea.id}`}
                >
                  <p className="flex-1 text-sm text-foreground/80 whitespace-pre-wrap break-words">
                    {idea.content}
                  </p>
                  <button
                    onClick={() => deleteMutation.mutate(idea.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-opacity mt-0.5"
                    data-testid={`btn-delete-idea-${idea.id}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
