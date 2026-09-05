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
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const onSaveErrorRef = useRef(options?.onSaveError);
  onSaveErrorRef.current = options?.onSaveError;

  const persist = useCallback(
    async (content: string, title?: string): Promise<boolean> => {
      if (!documentId) return false;

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
        lastContentRef.current = content;
        setLastSaved(new Date());
        return true;
      } catch (err) {
        if (!(err instanceof SessionExpiredError)) {
          onSaveErrorRef.current?.();
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [documentId, chapterId]
  );

  const enqueueSave = useCallback(
    (content: string, title?: string): Promise<boolean> => {
      const result = saveChainRef.current.then(() => persist(content, title));
      saveChainRef.current = result.then(() => undefined, () => undefined);
      return result;
    },
    [persist]
  );

  const save = useCallback(
    (content: string, title?: string) => {
      if (!documentId || content === lastContentRef.current) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void enqueueSave(content, title);
      }, 1500);
    },
    [documentId, enqueueSave]
  );

  const saveNow = useCallback(
    (content: string, title?: string): Promise<boolean> => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return enqueueSave(content, title);
    },
    [enqueueSave]
  );

  return { save, saveNow, saving, lastSaved };
}
