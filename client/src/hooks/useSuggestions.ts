import { useState, useRef, useCallback } from "react";
import { fetchSuggestions } from "@/lib/api";

export interface Suggestion {
  type: "grammar" | "vocabulary" | "style" | "pacing" | "story" | "tone";
  severity: "info" | "warning" | "error";
  title: string;
  description: string;
  original: string | null;
  alternatives: string[];
}

export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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
        setSuggestions(result.suggestions || []);
      } catch (e) {
        console.error("Failed to get suggestions:", e);
      } finally {
        setLoading(false);
      }
    }, 2000);
  }, []);

  return { suggestions, loading, requestSuggestions, setSuggestions };
}
