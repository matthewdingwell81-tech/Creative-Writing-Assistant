import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPlanning, deletePlanning, fetchPlanning, reorderPlanning, updatePlanning } from '@/lib/planningApi';
import type { PlanningInput, PlanningKind, PlanningRecord } from '@/types/planning';
import { useAuth } from '@/hooks/useAuth';

export const planningKey = (documentId: number, userId?: string) => ['planning', userId, documentId] as const;

export function usePlanningList(documentId: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: planningKey(documentId, user?.id),
    queryFn: () => fetchPlanning(documentId),
    enabled: !!user,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}

export function usePlanningMutations(documentId: number) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = planningKey(documentId, user?.id);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const upsert = (saved: PlanningRecord) => {
    qc.setQueryData<PlanningRecord[]>(key, old => [...(old ?? []).filter(r => r.id !== saved.id), saved]
      .sort((a, b) => a.position - b.position || a.id - b.id));
    return refresh();
  };
  const create = useMutation({
    mutationFn: (input: PlanningInput) => createPlanning(documentId, input),
    onSuccess: upsert,
  });
  const update = useMutation({
    mutationFn: (v: { id: number; input: PlanningInput }) => updatePlanning(documentId, v.id, v.input),
    onSuccess: upsert,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deletePlanning(documentId, id),
    onSuccess: (_, id) => {
      qc.setQueryData<PlanningRecord[]>(key, old => (old ?? [])
        .filter(r => r.id !== id && !(r.kind === 'relationship' && (r.characterId === id || r.relatedCharacterId === id)))
        .map(r => ({ ...r, characterId: r.characterId === id ? null : r.characterId, relatedCharacterId: r.relatedCharacterId === id ? null : r.relatedCharacterId })));
      return refresh();
    },
  });
  const reorder = useMutation({
    mutationFn: (v: { kind: PlanningKind; ids: number[] }) => reorderPlanning(documentId, v.kind, v.ids),
    onSuccess: (records) => {
      qc.setQueryData(key, records);
      return refresh();
    },
  });
  return { create, update, remove, reorder };
}
