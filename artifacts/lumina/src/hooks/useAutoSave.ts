import { useRef, useCallback, useState } from "react";
import { updateDocument, updateChapter, SessionExpiredError } from "@/lib/api";

interface UseAutoSaveOptions {
  onSaveError?: () => void;
}

export function useAutoSave(documentId: number | null, chapterId?: number | null, options?: UseAutoSaveOptions) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContentRef = useRef("");
  const onSaveErrorRef = useRef(options?.onSaveError);
  onSaveErrorRef.current = options?.onSaveError;

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
        } catch (err) {
          if (err instanceof SessionExpiredError) return;
          onSaveErrorRef.current?.();
        } finally {
          setSaving(false);
        }
      }, 1500);
    },
    [documentId, chapterId]
  );

  return { save, saving, lastSaved };
}
