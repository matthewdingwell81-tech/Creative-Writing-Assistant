import { usePlanningList } from './use-planning';
import { PlanningSection } from './PlanningSection';
import type { PlanningKind } from '@/types/planning';
import type { Chapter } from '@/types/schema';

export type BoardSection = 'chapters' | 'character' | 'timeline' | 'worldbuilding' | 'note';

export const PLANNING_TABS: { id: BoardSection; label: string }[] = [
  { id: 'chapters', label: 'Chapters' },
  { id: 'character', label: 'Characters' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'worldbuilding', label: 'Worldbuilding' },
  { id: 'note', label: 'Notes' },
];

interface Props {
  documentId: number;
  chapters: Chapter[];
  section: BoardSection;
  onOpenChapter: (id: number) => void;
}

/** All sections stay mounted (hidden) so unsaved drafts survive tab switches. */
export function StoryPlanning({ documentId, chapters, section, onOpenChapter }: Props) {
  const q = usePlanningList(documentId);
  const records = q.data ?? [];
  const kinds: PlanningKind[] = ['character', 'timeline', 'worldbuilding', 'note'];
  return (
    <div data-testid="planning-root" hidden={section === 'chapters'}>
      {q.isError && q.data && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Could not refresh your plan. Showing the last loaded entries.{' '}
          <button type="button" className="underline" onClick={() => void q.refetch()}>Try again</button>
        </p>
      )}
      {kinds.map((kind) => (
        <PlanningSection
          key={kind}
          documentId={documentId}
          kind={kind}
          records={records}
          loading={q.isLoading}
          loadError={q.isError && !q.data ? (q.error as Error).message : null}
          onRetry={() => void q.refetch()}
          chapters={chapters}
          onOpenChapter={onOpenChapter}
          hidden={section !== kind}
        />
      ))}
    </div>
  );
}
