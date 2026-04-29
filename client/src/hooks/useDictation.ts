import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type DictationErrorKind =
  | 'unsupported'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'unknown';

export interface DictationError {
  kind: DictationErrorKind;
  message: string;
}

export interface UseDictationOptions {
  lang?: string;
  onFinalTranscript?: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onError?: (err: DictationError) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface UseDictationReturn {
  supported: boolean;
  listening: boolean;
  interimTranscript: string;
  error: DictationError | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useDictation(options: UseDictationOptions = {}): UseDictationReturn {
  const { lang, onFinalTranscript, onInterimTranscript, onError, onStart, onEnd } = options;

  const [supported] = useState<boolean>(() => getSpeechRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<DictationError | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const interimRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SILENCE_TIMEOUT_MS = 10000;
  const callbacksRef = useRef({ onFinalTranscript, onInterimTranscript, onError, onStart, onEnd });

  callbacksRef.current = { onFinalTranscript, onInterimTranscript, onError, onStart, onEnd };

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang =
      lang ||
      (typeof document !== 'undefined' && document.documentElement.lang) ||
      (typeof navigator !== 'undefined' && navigator.language) ||
      'en-US';

    const armSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        // Long silence — stop listening rather than restarting indefinitely
        wantListeningRef.current = false;
        try { recognition.stop(); } catch { /* ignore */ }
      }, SILENCE_TIMEOUT_MS);
    };

    const clearSilenceTimer = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };

    recognition.onstart = () => {
      setListening(true);
      setError(null);
      armSilenceTimer();
      callbacksRef.current.onStart?.();
    };

    recognition.onend = () => {
      clearSilenceTimer();
      // Auto-restart if the user still wants to listen (some browsers cut off after a few seconds)
      if (wantListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // fall through to stop
        }
      }
      // Finalize any pending interim transcript so trailing words aren't lost on stop
      const pending = interimRef.current.trim();
      interimRef.current = '';
      if (pending) {
        callbacksRef.current.onInterimTranscript?.('');
        callbacksRef.current.onFinalTranscript?.(pending);
      }
      setListening(false);
      setInterimTranscript('');
      callbacksRef.current.onEnd?.();
    };

    recognition.onerror = (ev) => {
      const kind: DictationErrorKind =
        ev.error === 'not-allowed' ? 'not-allowed'
        : ev.error === 'service-not-allowed' ? 'service-not-allowed'
        : ev.error === 'no-speech' ? 'no-speech'
        : ev.error === 'audio-capture' ? 'audio-capture'
        : ev.error === 'network' ? 'network'
        : ev.error === 'aborted' ? 'aborted'
        : 'unknown';

      // 'no-speech' and 'aborted' are normal during continuous use; don't surface them as errors
      if (kind === 'no-speech' || kind === 'aborted') {
        return;
      }

      // Stop trying to auto-restart on permission/hardware/network failures to avoid restart loops
      if (
        kind === 'not-allowed' ||
        kind === 'service-not-allowed' ||
        kind === 'audio-capture' ||
        kind === 'network'
      ) {
        wantListeningRef.current = false;
      }

      const message =
        kind === 'not-allowed' || kind === 'service-not-allowed'
          ? 'Microphone access was blocked. Please allow mic access in your browser to use dictation.'
        : kind === 'audio-capture'
          ? 'No microphone was found. Please connect a mic and try again.'
        : kind === 'network'
          ? 'Speech recognition lost its network connection. Please try again.'
          : ev.message || 'Dictation stopped unexpectedly.';

      const dictationErr: DictationError = { kind, message };
      setError(dictationErr);
      callbacksRef.current.onError?.(dictationErr);
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          finalChunk += transcript;
        } else {
          interim += transcript;
        }
      }

      // Reset silence timer on any speech activity
      armSilenceTimer();

      if (finalChunk) {
        interimRef.current = '';
        setInterimTranscript('');
        callbacksRef.current.onInterimTranscript?.('');
        callbacksRef.current.onFinalTranscript?.(finalChunk);
      }
      if (interim) {
        interimRef.current = interim;
        setInterimTranscript(interim);
        callbacksRef.current.onInterimTranscript?.(interim);
      } else if (!finalChunk) {
        interimRef.current = '';
        setInterimTranscript('');
        callbacksRef.current.onInterimTranscript?.('');
      }
    };

    recognitionRef.current = recognition;

    return () => {
      wantListeningRef.current = false;
      clearSilenceTimer();
      interimRef.current = '';
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!supported) {
      const err: DictationError = {
        kind: 'unsupported',
        message: 'Voice dictation is not supported in this browser. Try Chrome, Edge, or Safari.',
      };
      setError(err);
      callbacksRef.current.onError?.(err);
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setError(null);
    wantListeningRef.current = true;
    try {
      recognition.start();
    } catch {
      // start() throws if already started; ignore
    }
  }, [supported]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setInterimTranscript('');
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Stop listening when the tab becomes hidden to avoid stuck states
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.hidden && wantListeningRef.current) {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop]);

  return { supported, listening, interimTranscript, error, start, stop, toggle };
}

/**
 * Convert a raw spoken-transcript chunk into typed text.
 * Maps simple punctuation commands and "new line"/"new paragraph" markers.
 */
export function normalizeDictation(raw: string): { text: string; newlines: number; trailingNewlines: number } {
  let s = raw;

  // Replace explicit newline commands with markers we can split on
  s = s.replace(/\b(new paragraph|new line|next line|line break)\b/gi, '\n');

  // Replace spoken punctuation with characters
  s = s.replace(/\s*\b(period|full stop)\b\s*/gi, '. ');
  s = s.replace(/\s*\bcomma\b\s*/gi, ', ');
  s = s.replace(/\s*\bquestion mark\b\s*/gi, '? ');
  s = s.replace(/\s*\bexclamation (point|mark)\b\s*/gi, '! ');
  s = s.replace(/\s*\bcolon\b\s*/gi, ': ');
  s = s.replace(/\s*\bsemicolon\b\s*/gi, '; ');
  s = s.replace(/\s*\b(open|opening) (paren|parenthesis)\b\s*/gi, ' (');
  s = s.replace(/\s*\b(close|closing) (paren|parenthesis)\b\s*/gi, ') ');
  s = s.replace(/\s*\b(open|opening) (quote|quotes)\b\s*/gi, ' "');
  s = s.replace(/\s*\b(close|closing) (quote|quotes)\b\s*/gi, '" ');

  // Collapse spaces around newlines and tidy whitespace
  s = s.replace(/[ \t]*\n[ \t]*/g, '\n');
  s = s.replace(/[ \t]{2,}/g, ' ');

  // Count trailing newlines for paragraph handling
  const trailingMatch = s.match(/\n+$/);
  const trailingNewlines = trailingMatch ? trailingMatch[0].length : 0;
  const newlines = (s.match(/\n/g) || []).length;

  return { text: s, newlines, trailingNewlines };
}
