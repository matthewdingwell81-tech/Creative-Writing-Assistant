import { useRef, useCallback, useState } from "react";
import { updateDocument, updateChapter } from "@/lib/api";

export function useAutoSave(documentId: number | null, chapterId?: number | null) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContentRef = useRef("");

  const save = useCallback(
    (content: string, title?: string) => {
      if (!documentId) return;
      if (content === lastContentRef.current) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(async () => {
        lastContentRef.current = content;
        setSaving(true);
        try {
          if (chapterId) {
            await updateChapter(chapterId, { content });
            if (title) await updateDocument(documentId, { title });
          } else {
            const updates: Record<string, string> = { content };
            if (title) updates.title = title;
            await updateDocument(documentId, updates);
          }
          setLastSaved(new Date());
        } catch {
          // silent fail on auto-save
        } finally {
          setSaving(false);
        }
      }, 1500);
    },
    [documentId, chapterId]
  );

  return { save, saving, lastSaved };
}
