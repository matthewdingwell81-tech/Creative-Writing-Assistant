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

export interface ChangeHistoryEntry {
  id: string;
  suggestionId: string;
  type: string;
  title: string;
  original: string;
  replacement: string;
  timestamp: number;
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
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [savedSuggestions, setSavedSuggestions] = useState<Suggestion[]>([]);
  const [changeHistory, setChangeHistory] = useState<ChangeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  const requestSuggestions = useCallback((text: string, documentType: string = "fiction") => {
    const plainText = text
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&mdash;/gi, "—")
      .replace(/&ndash;/gi, "–")
      .replace(/\s+/g, " ")
      .trim();

    if (plainText === lastTextRef.current) return;
    if (plainText.length < 30) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      lastTextRef.current = plainText;

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const result = await fetchSuggestions(plainText, documentType, controller.signal);
        if (controller.signal.aborted) return;
        const raw: Omit<Suggestion, "id">[] = result.suggestions || [];
        const withIds = raw.map((s) => ({ ...s, id: generateSuggestionId(s) }));
        setSuggestions(withIds);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        console.error("Failed to get suggestions:", e);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 2000);
  }, []);

  const dismissSuggestion = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    setSavedSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const applySuggestionById = useCallback((suggestionId: string, original: string, replacement: string) => {
    setAppliedIds((prev) => new Set(prev).add(suggestionId));

    setSuggestions((current) => {
      setSavedSuggestions((saved) => {
        const found = current.find((s) => s.id === suggestionId) || saved.find((s) => s.id === suggestionId);
        const entry: ChangeHistoryEntry = {
          id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          suggestionId,
          type: found?.type || "grammar",
          title: found?.title || "Applied change",
          original,
          replacement,
          timestamp: Date.now(),
        };
        setChangeHistory((prev) => [entry, ...prev]);
        return saved.filter((s) => s.id !== suggestionId);
      });
      return current;
    });
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

  const clearHistory = useCallback(() => {
    setChangeHistory([]);
  }, []);

  const savedIdSet = new Set(savedSuggestions.map((s) => s.id));
  const visibleSuggestions = suggestions.filter(
    (s) => !dismissedIds.has(s.id) && !savedIdSet.has(s.id) && !appliedIds.has(s.id)
  );

  return {
    suggestions: visibleSuggestions,
    savedSuggestions,
    savedCount: savedSuggestions.length,
    changeHistory,
    loading,
    requestSuggestions,
    setSuggestions,
    dismissSuggestion,
    applySuggestionById,
    saveSuggestion,
    removeSaved,
    clearHistory,
  };
}
