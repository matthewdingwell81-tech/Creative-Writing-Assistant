import { useState } from 'react';
import { FileText, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteDocument, SessionExpiredError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export interface DocumentItem {
  id: number;
  title: string;
  documentType: string;
  updatedAt: Date;
}

interface DocumentListProps {
  documents: DocumentItem[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  isCreating?: boolean;
}

export default function DocumentList({ documents, activeId, onSelect, onNew, isCreating }: DocumentListProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
    onError: (err: unknown) => {
      if (err instanceof SessionExpiredError) return;
      toast({ title: "Could not delete document", description: "Please try again.", variant: "destructive" });
    },
  });

  function handleDeleteConfirm() {
    if (pendingDeleteId !== null) {
      deleteMutation.mutate(pendingDeleteId);
    }
    setPendingDeleteId(null);
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documents</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNew} disabled={isCreating} data-testid="btn-new-doc-sidebar">
          {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <div className="space-y-1">
        {documents.map((doc) => (
          <div
            key={doc.id}
            onClick={() => onSelect(doc.id)}
            className={`group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors text-sm ${
              activeId === doc.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
            data-testid={`doc-item-${doc.id}`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate flex-1">{doc.title || 'Untitled'}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPendingDeleteId(doc.id);
              }}
              className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              data-testid={`btn-delete-doc-${doc.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {documents.length === 0 && (
          <p className="text-xs text-muted-foreground/60 text-center py-4">No documents yet</p>
        )}
      </div>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the document and all its chapters. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
