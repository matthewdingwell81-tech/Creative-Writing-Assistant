import { useState, useRef, useCallback } from "react";
import { fetchSuggestions } from "@/lib/api";

export interface Suggestion {
  id: string;
  type: "grammar" | "vocabulary" | "style" | "pacing" | "story" | "tone";
  severity: "info" | "warning" | "error";
  title: string;
  description: string;
  original: string | null;
  alternatives: string[];
}

function generateSuggestionId(sug: Omit<Suggestion, "id">): string {
  const raw = `${sug.type}|${sug.severity}|${sug.title}|${sug.original || ""}|${sug.description.slice(0, 60)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `sug-${sug.type}-${(hash >>> 0).toString(36)}`;
}

export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [savedSuggestions, setSavedSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef("");

  const requestSuggestions = useCallback((text: string, documentType: string = "fiction") => {
    const plainText = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    if (plainText === lastTextRef.current) return;
    if (plainText.length < 30) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      lastTextRef.current = plainText;
      setLoading(true);
      try {
        const result = await fetchSuggestions(plainText, documentType);
        const raw: Omit<Suggestion, "id">[] = result.suggestions || [];
        const withIds = raw.map((s) => ({ ...s, id: generateSuggestionId(s) }));
        setSuggestions(withIds);
      } catch (e) {
        console.error("Failed to get suggestions:", e);
      } finally {
        setLoading(false);
      }
    }, 2000);
  }, []);

  const dismissSuggestion = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    setSavedSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const saveSuggestion = useCallback((id: string) => {
    setSuggestions((current) => {
      const found = current.find((s) => s.id === id);
      if (found) {
        setSavedSuggestions((prev) => {
          if (prev.some((s) => s.id === id)) return prev;
          return [...prev, found];
        });
      }
      return current;
    });
  }, []);

  const removeSaved = useCallback((id: string) => {
    setSavedSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const savedIdSet = new Set(savedSuggestions.map((s) => s.id));
  const visibleSuggestions = suggestions.filter(
    (s) => !dismissedIds.has(s.id) && !savedIdSet.has(s.id)
  );

  return {
    suggestions: visibleSuggestions,
    savedSuggestions,
    savedCount: savedSuggestions.length,
    loading,
    requestSuggestions,
    setSuggestions,
    dismissSuggestion,
    saveSuggestion,
    removeSaved,
  };
}
