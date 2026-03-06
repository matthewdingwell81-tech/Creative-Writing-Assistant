import { useRef, useCallback, useState } from "react";
import { updateDocument } from "@/lib/api";

export function useAutoSave(documentId: number | null) {
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
          const updates: any = { content };
          if (title) updates.title = title;
          await updateDocument(documentId, updates);
          setLastSaved(new Date());
        } catch (e) {
          console.error("Auto-save failed:", e);
        } finally {
          setSaving(false);
        }
      }, 1500);
    },
    [documentId]
  );

  return { save, saving, lastSaved };
}
