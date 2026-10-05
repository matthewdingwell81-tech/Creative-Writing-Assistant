import { cloneElement, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanningInput, PlanningKind, PlanningRecord } from '@/types/planning';
import type { Chapter } from '@/types/schema';

const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';
const KIND_LABEL: Record<PlanningKind, string> = {
  character: 'character', relationship: 'relationship', timeline: 'timeline event', worldbuilding: 'world entry', note: 'note',
};

interface Props {
  kind: PlanningKind;
  record: PlanningRecord | null;
  characters: PlanningRecord[];
  chapters: Chapter[];
  pending: boolean;
  error: string | null;
  onSubmit: (input: PlanningInput) => void;
  onCancel: () => void;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactElement<{ id?: string }> }) {
  const uniqueId = useId();
  const fieldId = `${uniqueId}-${id}`;
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {cloneElement(children, { id: fieldId })}
    </div>
  );
}

export function PlanningForm({ kind, record, characters, chapters, pending, error, onSubmit, onCancel }: Props) {
  const [d, setD] = useState({
    title: record?.title ?? '', content: record?.content ?? '', role: record?.role ?? '',
    motivations: record?.motivations ?? '', traits: record?.traits ?? '', arc: record?.arc ?? '',
    category: record?.category ?? '', timeLabel: record?.timeLabel ?? '',
    chapterId: record?.chapterId != null ? String(record.chapterId) : '',
    characterId: record?.characterId != null ? String(record.characterId) : '',
    relatedCharacterId: record?.relatedCharacterId != null ? String(record.relatedCharacterId) : '',
  });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((p) => ({ ...p, [k]: e.target.value }));
  const num = (v: string) => (v === '' ? null : Number(v));
  const isChar = kind === 'character';
  const isRel = kind === 'relationship';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!d.title.trim()) return setProblem(isRel ? 'Describe the relationship.' : 'A title is required.');
    if (isRel) {
      if (!d.characterId || !d.relatedCharacterId) return setProblem('Choose two characters.');
      if (d.characterId === d.relatedCharacterId) return setProblem('A relationship needs two different characters.');
    }
    setProblem(null);
    const input: PlanningInput = { kind, title: d.title.trim(), content: d.content, chapterId: num(d.chapterId) };
    if (isChar) Object.assign(input, { role: d.role, motivations: d.motivations, traits: d.traits, arc: d.arc });
    if (kind === 'timeline') Object.assign(input, { timeLabel: d.timeLabel });
    if (kind === 'worldbuilding' || kind === 'note') Object.assign(input, { category: d.category });
    if (isRel) Object.assign(input, { characterId: num(d.characterId), relatedCharacterId: num(d.relatedCharacterId) });
    else if (!isChar) input.characterId = num(d.characterId);
    onSubmit(input);
  };

  const charSelect = (id: string, key: 'characterId' | 'relatedCharacterId', optional: boolean, label: string) => (
    <Field id={id} label={label}>
      <select id={id} className={field} value={d[key]} onChange={set(key)} disabled={pending}>
        <option value="">{optional ? 'None' : 'Select a character'}</option>
        {characters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </Field>
  );
  const text = (id: string, key: keyof typeof d, label: string, rows = 3) => (
    <Field id={id} label={label}>
      <textarea id={id} rows={rows} maxLength={20000} className={field} value={d[key]} onChange={set(key)} disabled={pending} />
    </Field>
  );
  const shown = problem || error;

  return (
    <form data-testid="planning-form" onSubmit={submit} className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 shadow-sm">
      <h3 className="font-serif text-lg">{record ? 'Edit' : 'New'} {KIND_LABEL[kind]}</h3>
      {isRel && (
        <div className="grid gap-4 sm:grid-cols-2">
          {charSelect('planning-character', 'characterId', false, 'Character')}
          {charSelect('planning-related', 'relatedCharacterId', false, 'Related character')}
        </div>
      )}
      <Field id="planning-title" label={isChar ? 'Name' : isRel ? 'Relationship' : 'Title'}>
        <input id="planning-title" data-testid="planning-title" maxLength={200} className={field} value={d.title} onChange={set('title')} disabled={pending}
          placeholder={isRel ? 'e.g. estranged siblings' : undefined} />
      </Field>
      {isChar && (
        <>
          <Field id="planning-role" label="Role"><input id="planning-role" maxLength={200} className={field} value={d.role} onChange={set('role')} disabled={pending} /></Field>
          {text('planning-motivations', 'motivations', 'Motivations')}
          {text('planning-traits', 'traits', 'Traits')}
          {text('planning-arc', 'arc', 'Arc')}
        </>
      )}
      {kind === 'timeline' && (
        <Field id="planning-timelabel" label="When">
          <input id="planning-timelabel" maxLength={200} className={field} value={d.timeLabel} onChange={set('timeLabel')} disabled={pending} placeholder="e.g. Third winter after the fall" />
        </Field>
      )}
      {(kind === 'worldbuilding' || kind === 'note') && (
        <Field id="planning-category" label="Category"><input id="planning-category" maxLength={100} className={field} value={d.category} onChange={set('category')} disabled={pending} /></Field>
      )}
      {text('planning-content', 'content', isChar ? 'Detailed outline' : isRel ? 'Notes' : 'Details', 4)}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="planning-chapter" label="Linked chapter">
          <select id="planning-chapter" className={field} value={d.chapterId} onChange={set('chapterId')} disabled={pending}>
            <option value="">None</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.title || 'Untitled Chapter'}</option>)}
          </select>
        </Field>
        {!isChar && !isRel && charSelect('planning-linked-character', 'characterId', true, 'Linked character')}
      </div>
      {shown && <p role="alert" data-testid="planning-error" className="text-sm text-destructive">{shown}</p>}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending} data-testid="planning-cancel">Cancel</Button>
        <Button type="submit" data-testid="planning-save" disabled={pending}>
          {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
        </Button>
      </div>
    </form>
  );
}
