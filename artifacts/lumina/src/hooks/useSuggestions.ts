import { useState, useRef, useCallback } from "react";
import { fetchSuggestions } from "@/lib/api";

export type SuggestionAnalysisMode = "automatic" | "manual";

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

function normalizeText(text: string): string {
  return text
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
}

const ANALYSIS_MODE_STORAGE_KEY = "lumina-suggestion-analysis-mode";

function getStoredAnalysisMode(): SuggestionAnalysisMode {
  if (typeof window === "undefined") return "automatic";
  try {
    return window.localStorage.getItem(ANALYSIS_MODE_STORAGE_KEY) === "manual"
      ? "manual"
      : "automatic";
  } catch {
    return "automatic";
  }
}

export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [savedSuggestions, setSavedSuggestions] = useState<Suggestion[]>([]);
  const [changeHistory, setChangeHistory] = useState<ChangeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<Suggestion[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const currentSuggestionsRef = useRef<Suggestion[]>([]);
  const [analysisMode, setAnalysisModeState] = useState<SuggestionAnalysisMode>(getStoredAnalysisMode);

  const setAnalysisMode = useCallback((mode: SuggestionAnalysisMode) => {
    setAnalysisModeState(mode);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(ANALYSIS_MODE_STORAGE_KEY, mode);
      } catch {
        // Preference persistence is best effort when storage is unavailable.
      }
    }
  }, []);

  const runAnalysis = useCallback(async (
    plainText: string,
    documentType: string,
    requestVersion: number,
  ) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const result = await fetchSuggestions(plainText, documentType, controller.signal);
      if (controller.signal.aborted || requestVersion !== requestVersionRef.current) return;
      const raw: Omit<Suggestion, "id">[] = result.suggestions || [];
      const withIds = raw.map((s) => ({ ...s, id: generateSuggestionId(s) }));
      if (currentSuggestionsRef.current.length === 0) {
        currentSuggestionsRef.current = withIds;
        setSuggestions(withIds);
        setPendingSuggestions(null);
      } else {
        setPendingSuggestions(withIds);
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
    } finally {
      if (!controller.signal.aborted && requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const requestSuggestions = useCallback((text: string, documentType: string = "fiction") => {
    if (analysisMode !== "automatic") return;

    const plainText = normalizeText(text);
    if (plainText === lastTextRef.current) return;
    if (plainText.length < 30) return;

    const requestVersion = ++requestVersionRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null;
      lastTextRef.current = plainText;
      void runAnalysis(plainText, documentType, requestVersion);
    }, 2000);
  }, [analysisMode, runAnalysis]);

  const analyzeSuggestions = useCallback((text: string, documentType: string = "fiction") => {
    const plainText = normalizeText(text);
    if (plainText.length < 30) return;

    const requestVersion = ++requestVersionRef.current;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    lastTextRef.current = plainText;
    void runAnalysis(plainText, documentType, requestVersion);
  }, [runAnalysis]);

  const showLatestSuggestions = useCallback(() => {
    setPendingSuggestions((pending) => {
      if (pending === null) return pending;
      currentSuggestionsRef.current = pending;
      setSuggestions(pending);
      return null;
    });
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

  const cancelPending = useCallback(() => {
    requestVersionRef.current += 1;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
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
    analysisMode,
    hasSuggestionUpdate: pendingSuggestions !== null,
    pendingSuggestionCount: pendingSuggestions?.length ?? 0,
    requestSuggestions,
    analyzeSuggestions,
    setAnalysisMode,
    showLatestSuggestions,
    cancelPending,
    setSuggestions,
    dismissSuggestion,
    applySuggestionById,
    saveSuggestion,
    removeSaved,
    clearHistory,
  };
}
