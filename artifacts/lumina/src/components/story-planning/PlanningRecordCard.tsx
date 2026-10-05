import { useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanningRecord } from '@/types/planning';
import type { Chapter } from '@/types/schema';

interface Props {
  record: PlanningRecord;
  characters: PlanningRecord[];
  chapters: Chapter[];
  orderable?: { canUp: boolean; canDown: boolean; busy: boolean; onMove: (dir: -1 | 1) => void };
  deleting: boolean;
  actionsDisabled: boolean;
  deleteError: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onOpenChapter: (id: number) => void;
}

function Line({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

export function PlanningRecordCard({ record: r, characters, chapters, orderable, deleting, actionsDisabled, deleteError, onEdit, onDelete, onOpenChapter }: Props) {
  const [confirming, setConfirming] = useState(false);
  const name = (id: number | null) => characters.find((c) => c.id === id)?.title ?? 'Unknown';
  const chapter = chapters.find((c) => c.id === r.chapterId);
  const isChar = r.kind === 'character';

  return (
    <article data-testid={`planning-record-${r.id}`} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {r.kind === 'timeline' && r.timeLabel && <p className="text-xs uppercase tracking-wider text-primary font-medium">{r.timeLabel}</p>}
          {r.kind === 'relationship' && (
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{name(r.characterId)} &amp; {name(r.relatedCharacterId)}</p>
          )}
          <h3 className="font-serif text-lg break-words">{r.title}</h3>
          {(r.category || (isChar && r.role)) && <p className="text-xs text-muted-foreground">{isChar ? r.role : r.category}</p>}
        </div>
        <div className="flex items-center shrink-0 -mr-2 -mt-1">
          {orderable && (
            <>
              <Button size="icon" variant="ghost" aria-label={`Move ${r.title} earlier`} data-testid={`planning-up-${r.id}`}
                disabled={!orderable.canUp || orderable.busy} onClick={() => orderable.onMove(-1)}>
                {orderable.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Move ${r.title} later`} data-testid={`planning-down-${r.id}`}
                disabled={!orderable.canDown || orderable.busy} onClick={() => orderable.onMove(1)}>
                <ArrowDown className="w-4 h-4" />
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" disabled={actionsDisabled} aria-label={`Edit ${r.title}`} data-testid={`planning-edit-${r.id}`} onClick={onEdit}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={actionsDisabled} aria-label={`Delete ${r.title}`} data-testid={`planning-delete-${r.id}`} onClick={() => setConfirming(true)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <dl className="space-y-2">
        {isChar && <><Line label="Motivations" value={r.motivations} /><Line label="Traits" value={r.traits} /><Line label="Arc" value={r.arc} /></>}
        <Line label={isChar ? 'Outline' : 'Details'} value={r.content} />
      </dl>
      {(chapter || (r.characterId != null && !isChar && r.kind !== 'relationship')) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {chapter && (
            <button type="button" data-testid={`planning-chapter-link-${r.id}`} onClick={() => onOpenChapter(chapter.id)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 hover:bg-foreground/5 outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <BookOpen className="w-3 h-3" />{chapter.title || 'Untitled Chapter'}
            </button>
          )}
          {r.characterId != null && !isChar && r.kind !== 'relationship' && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1">{name(r.characterId)}</span>
          )}
        </div>
      )}
      {confirming && (
        <div role="alertdialog" aria-label={`Confirm delete ${r.title}`} className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          <p className="text-sm">
            Delete &ldquo;{r.title}&rdquo;?
            {isChar && ' This also deletes every relationship involving this character and unlinks them from timeline events, world entries and notes.'}
          </p>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirming(false)} data-testid={`planning-delete-cancel-${r.id}`}>Keep</Button>
            <Button size="sm" variant="destructive" disabled={actionsDisabled} onClick={onDelete} data-testid={`planning-delete-confirm-${r.id}`}>
              {deleting && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}Delete
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
