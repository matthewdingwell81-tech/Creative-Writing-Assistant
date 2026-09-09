import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchResearch, createResearch, updateResearch, deleteResearch, attachResearch, detachResearch, fetchRelatedResearch } from '@/lib/api';
import { useToast } from './use-toast';
import type { Research } from '@/types/schema';

export interface ResearchItem extends Research {
  chapterIds: number[];
}

export interface RelatedResearch extends ResearchItem {
  score: number;
}

export function useResearch(documentId: number | null, filters?: { keyword?: string; tag?: string; chapterId?: number; scope?: 'global' | 'chapter' }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryKey = ['/api/research', documentId, filters];

  const query = useQuery<ResearchItem[]>({
    queryKey,
    queryFn: () => fetchResearch(documentId!, filters),
    enabled: !!documentId,
  });

  const create = useMutation({
    mutationFn: (data: any & { chapterIds?: number[] }) => createResearch(documentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research', documentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/research/related', documentId] });
      toast({ title: 'Added to library' });
    },
    onError: (err) => {
      toast({ title: 'Failed to add research', description: err.message, variant: 'destructive' });
    }
  });

  const update = useMutation({
    mutationFn: ({ id, data, chapterIds }: { id: number, data: any, chapterIds?: number[], originalChapterIds?: number[] }) =>
      updateResearch(id, chapterIds === undefined ? data : { ...data, chapterIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research', documentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/research/related', documentId] });
      toast({ title: 'Saved changes' });
    },
    onError: (err) => {
      toast({ title: 'Failed to update research', description: err.message, variant: 'destructive' });
    }
  });

  const remove = useMutation({
    mutationFn: deleteResearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research', documentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/research/related', documentId] });
      toast({ title: 'Removed from library' });
    },
    onError: (err) => {
      toast({ title: 'Failed to delete research', description: err.message, variant: 'destructive' });
    }
  });

  const attach = useMutation({
    mutationFn: ({ id, chapterId }: { id: number, chapterId: number }) => attachResearch(id, chapterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research', documentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/research/related', documentId] });
    },
    onError: (err) => {
      toast({ title: 'Failed to attach to chapter', description: err.message, variant: 'destructive' });
    }
  });

  const detach = useMutation({
    mutationFn: ({ id, chapterId }: { id: number, chapterId: number }) => detachResearch(id, chapterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research', documentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/research/related', documentId] });
    },
    onError: (err) => {
      toast({ title: 'Failed to detach from chapter', description: err.message, variant: 'destructive' });
    }
  });

  return {
    query,
    create,
    update,
    remove,
    attach,
    detach
  };
}

export function useRelatedResearch(documentId: number | null, chapterId: number | null) {
  const queryKey = ['/api/research/related', documentId, chapterId];
  return useQuery<RelatedResearch[]>({
    queryKey,
    queryFn: () => fetchRelatedResearch(documentId!, chapterId!),
    enabled: !!documentId && !!chapterId,
  });
}
