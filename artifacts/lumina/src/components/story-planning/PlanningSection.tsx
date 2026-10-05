import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanningInput, PlanningKind, PlanningRecord } from '@/types/planning';
import type { Chapter } from '@/types/schema';
import { PlanningForm } from './PlanningForm';
import { PlanningRecordCard } from './PlanningRecordCard';
import { usePlanningMutations } from './use-planning';

interface Props {
  documentId: number;
  kind: PlanningKind;
  records: PlanningRecord[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  chapters: Chapter[];
  onOpenChapter: (id: number) => void;
  hidden: boolean;
}

const COPY: Record<string, { title: string; add: string; empty: string }> = {
  character: { title: 'Characters', add: 'Add character', empty: 'No characters yet. Outline who drives your story.' },
  relationship: { title: 'Relationships', add: 'Add relationship', empty: 'No relationships yet. Connect two saved characters.' },
  timeline: { title: 'Timeline', add: 'Add event', empty: 'No events yet. Lay out what happens, in order.' },
  worldbuilding: { title: 'Worldbuilding', add: 'Add entry', empty: 'No entries yet. Capture places, rules and history.' },
  note: { title: 'Notes', add: 'Add card', empty: 'No cards yet. Keep loose ideas here.' },
};

type Editing = { kind: PlanningKind; record: PlanningRecord | null } | null;

export function PlanningSection({ documentId, kind, records, loading, loadError, onRetry, chapters, onOpenChapter, hidden }: Props) {
  const m = usePlanningMutations(documentId);
  const [editing, setEditing] = useState<Editing>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteFailedId, setDeleteFailedId] = useState<number | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [category, setCategory] = useState('');
  const categoryId = `planning-category-filter-${kind}`;
  const busy = m.create.isPending || m.update.isPending || m.remove.isPending || m.reorder.isPending;
  const kinds: PlanningKind[] = kind === 'character' ? ['character', 'relationship'] : [kind];
  const characters = records.filter((r) => r.kind === 'character');
  const writeError = (editing?.record ? m.update.error : m.create.error) as Error | null;

  const open = (k: PlanningKind, record: PlanningRecord | null) => {
    if (editing || busy) return;
    m.create.reset(); m.update.reset();
    setSavedMessage('');
    setEditing({ kind: k, record });
  };
  const submit = (input: PlanningInput) => {
    const done = { onSuccess: () => {
      setCategory('');
      setEditing(null);
      setSavedMessage('Saved to this story.');
    } };
    if (editing?.record) m.update.mutate({ id: editing.record.id, input }, done);
    else m.create.mutate(input, done);
  };
  const move = (list: PlanningRecord[], idx: number, dir: -1 | 1) => {
    const ids = list.map((r) => r.id);
    const [x] = ids.splice(idx, 1);
    ids.splice(idx + dir, 0, x);
    m.reorder.mutate({ kind: list[0].kind, ids });
  };
  const del = (id: number) => {
    setDeleteFailedId(null);
    setDeletingId(id);
    m.remove.mutate(id, {
      onSuccess: () => setSavedMessage('Entry deleted.'),
      onError: () => setDeleteFailedId(id),
      onSettled: () => setDeletingId(null),
    });
  };

  return (
    <section hidden={hidden} aria-label={COPY[kind].title} data-testid={`planning-section-${kind}`} className="space-y-8">
      {loading ? (
        <div className="space-y-3" data-testid="planning-loading">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-muted/60 animate-pulse" />)}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-destructive/40 p-6 text-center space-y-3" role="alert">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={onRetry}>Try again</Button>
        </div>
      ) : (
        kinds.map((k) => {
          const all = records.filter((r) => r.kind === k);
          const categorized = k === 'worldbuilding' || k === 'note';
          const categories = [...new Set(all.map(r => r.category).filter(Boolean))].sort();
          const list = categorized && category ? all.filter(r => r.category === category) : all;
          const formHere = editing?.kind === k;
          return (
            <div key={k} className="space-y-4">
              <div data-testid={`planning-heading-${k}`} className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl">{COPY[k].title}</h2>
                <Button data-testid={k === kind ? 'planning-add' : `planning-add-${k}`} onClick={() => open(k, null)} disabled={!!editing || busy || (k === 'relationship' && characters.length < 2)}>
                  <Plus className="w-4 h-4 mr-2" />{COPY[k].add}
                </Button>
              </div>
              {categorized && (categories.length > 0 || category) && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label htmlFor={categoryId}>Category</label>
                  <select id={categoryId} value={category} onChange={e => setCategory(e.target.value)}
                    className="max-w-full rounded-md border border-border bg-background px-3 py-2">
                    <option value="">All categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    {category && !categories.includes(category) && <option value={category}>{category}</option>}
                  </select>
                </div>
              )}
              {k === 'relationship' && characters.length < 2 && (
                <p className="text-xs text-muted-foreground">Save at least two characters to describe how they relate.</p>
              )}
              {formHere && (
                <PlanningForm
                  key={editing?.record?.id ?? 'new'}
                  kind={k}
                  record={editing!.record}
                  characters={characters}
                  chapters={chapters}
                  pending={m.create.isPending || m.update.isPending}
                  error={writeError?.message ?? null}
                  onSubmit={submit}
                  onCancel={() => setEditing(null)}
                />
              )}
              {list.length === 0 && !formHere ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-card/50 py-12 px-4 text-center text-sm text-muted-foreground">
                  {category && categorized ? 'No entries in this category.' : COPY[k].empty}
                </div>
              ) : (
                <div className={k === 'timeline' ? 'space-y-3' : 'grid gap-4 md:grid-cols-2'}>
                  {list.map((r, i) => (
                    <PlanningRecordCard
                      key={r.id}
                      record={r}
                      characters={characters}
                      chapters={chapters}
                      orderable={k === 'timeline' ? { canUp: i > 0, canDown: i < list.length - 1, busy: busy || !!editing, onMove: (d) => move(list, i, d) } : undefined}
                      actionsDisabled={busy || !!editing}
                      deleting={deletingId === r.id}
                      deleteError={deleteFailedId === r.id ? (m.remove.error as Error)?.message ?? null : null}
                      onEdit={() => open(k, r)}
                      onDelete={() => del(r.id)}
                      onOpenChapter={onOpenChapter}
                    />
                  ))}
                </div>
              )}
              {k === 'timeline' && m.reorder.isError && (
                <p role="alert" className="text-sm text-destructive flex items-center gap-2">
                  {(m.reorder.error as Error).message}
                </p>
              )}
            </div>
          );
        })
      )}
      {savedMessage && <p role="status" className="text-sm text-muted-foreground">{savedMessage}</p>}
      {m.reorder.isPending && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Saving order...</p>}
    </section>
  );
}
