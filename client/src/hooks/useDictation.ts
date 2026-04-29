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

function isMediaRecorderAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof window.MediaRecorder !== 'undefined'
  );
}

function pickRecorderMime(): string | undefined {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const c of candidates) {
    try {
      if (window.MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // ignore — older Safari throws on unknown types
    }
  }
  return undefined;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read audio'));
        return;
      }
      // strip the "data:<mime>;base64," prefix
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.slice(idx + 'base64,'.length) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read audio'));
    reader.readAsDataURL(blob);
  });
}

export type DictationEngine = 'web-speech' | 'whisper' | 'auto';

export type DictationActiveEngine = 'web-speech' | 'whisper';

export type DictationStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'recording'
  | 'uploading'
  | 'transcribing';

export type DictationErrorKind =
  | 'unsupported'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'transcription-failed'
  | 'unknown';

export interface DictationError {
  kind: DictationErrorKind;
  message: string;
}

export interface UseDictationOptions {
  lang?: string;
  engine?: DictationEngine;
  onFinalTranscript?: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onError?: (err: DictationError) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface UseDictationReturn {
  supported: boolean;
  webSpeechSupported: boolean;
  whisperSupported: boolean;
  activeEngine: DictationActiveEngine;
  listening: boolean;
  status: DictationStatus;
  interimTranscript: string;
  error: DictationError | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

// Maximum audio chunk Whisper will accept comfortably + protect server payload size
const WHISPER_MAX_DURATION_MS = 60_000;

export function useDictation(options: UseDictationOptions = {}): UseDictationReturn {
  const {
    lang,
    engine: requestedEngine = 'auto',
    onFinalTranscript,
    onInterimTranscript,
    onError,
    onStart,
    onEnd,
  } = options;

  const [webSpeechSupported] = useState<boolean>(() => getSpeechRecognitionCtor() !== null);
  const [whisperSupported] = useState<boolean>(() => isMediaRecorderAvailable());

  // Resolve the active engine. Each branch falls back to the other engine
  // if its preferred one isn't supported in this browser, so a stale
  // localStorage preference can never strand a user with no working option.
  // - 'whisper': prefer whisper, fall back to web-speech.
  // - 'web-speech': prefer web-speech, fall back to whisper.
  // - 'auto': prefer Web Speech, fall back to whisper.
  const activeEngine: DictationActiveEngine =
    requestedEngine === 'whisper'
      ? whisperSupported
        ? 'whisper'
        : 'web-speech'
      : requestedEngine === 'web-speech'
      ? webSpeechSupported
        ? 'web-speech'
        : 'whisper'
      : webSpeechSupported
      ? 'web-speech'
      : 'whisper';

  const supported =
    activeEngine === 'web-speech' ? webSpeechSupported : whisperSupported;

  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<DictationError | null>(null);

  // Web Speech refs
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const interimRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SILENCE_TIMEOUT_MS = 10000;
  // Deduplication: track the last final transcript text + when it was emitted.
  // If the same text arrives again within this window (ms) we drop it — this
  // prevents Chrome's session-restart overlap from inserting words twice.
  const lastFinalRef = useRef<{ text: string; at: number } | null>(null);
  const DEDUP_WINDOW_MS = 1500;
  // True while an internal auto-restart is in progress so onstart doesn't
  // re-fire the user-facing onStart callback on every Chrome session cycle.
  const isInternalRestartRef = useRef(false);

  // Whisper refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recorderMimeRef = useRef<string | undefined>(undefined);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTranscribeRef = useRef<AbortController | null>(null);
  // Set when the user explicitly cancels mid-flight so late transcripts
  // arriving after the abort are dropped rather than inserted at the caret.
  const whisperCancelledRef = useRef(false);
  // Ensures `onEnd` fires at most once per Whisper session, even when the
  // cancel/abort path and the fetch's `finally` clause both try to clean up.
  const whisperOnEndFiredRef = useRef(false);
  // True from the moment startWhisper is invoked until the recorder is
  // either fully started or torn down on failure. Synchronous re-entry
  // guard for rapid clicks during the mic-permission window.
  const whisperStartingRef = useRef(false);

  const fireWhisperEnd = () => {
    if (whisperOnEndFiredRef.current) return;
    whisperOnEndFiredRef.current = true;
    callbacksRef.current.onEnd?.();
  };

  const callbacksRef = useRef({ onFinalTranscript, onInterimTranscript, onError, onStart, onEnd });
  callbacksRef.current = { onFinalTranscript, onInterimTranscript, onError, onStart, onEnd };

  // ---------------- Web Speech engine setup ----------------
  useEffect(() => {
    if (activeEngine !== 'web-speech') return;
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
      setStatus('listening');
      setError(null);
      armSilenceTimer();
      // Only fire the user-facing onStart on the first start of a session,
      // not on every internal auto-restart (which Chrome does every ~60 s).
      if (!isInternalRestartRef.current) {
        callbacksRef.current.onStart?.();
      }
      isInternalRestartRef.current = false;
    };

    recognition.onend = () => {
      clearSilenceTimer();
      // Auto-restart if the user still wants to listen (some browsers cut off after a few seconds)
      if (wantListeningRef.current) {
        try {
          // Clear stale interim so the restarted session can't re-emit it as a
          // false final, and flag that this start is an internal restart.
          interimRef.current = '';
          setInterimTranscript('');
          isInternalRestartRef.current = true;
          recognition.start();
          return;
        } catch {
          isInternalRestartRef.current = false;
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
      setStatus('idle');
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
        // Deduplicate: drop the chunk if it is identical to the last one
        // emitted within the overlap window. This prevents Chrome's
        // session-restart handoff from inserting the same words twice.
        const now = Date.now();
        const last = lastFinalRef.current;
        const isDuplicate =
          last !== null &&
          last.text === finalChunk.trim() &&
          now - last.at < DEDUP_WINDOW_MS;
        if (!isDuplicate) {
          lastFinalRef.current = { text: finalChunk.trim(), at: now };
          callbacksRef.current.onFinalTranscript?.(finalChunk);
        }
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
      isInternalRestartRef.current = false;
      lastFinalRef.current = null;
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
  }, [lang, activeEngine]);

  // ---------------- Whisper helpers ----------------
  const cleanupWhisper = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* ignore */ }
      });
      mediaStreamRef.current = null;
    }
    recordedChunksRef.current = [];
  }, []);

  const reportError = useCallback((kind: DictationErrorKind, message: string) => {
    const err: DictationError = { kind, message };
    setError(err);
    callbacksRef.current.onError?.(err);
  }, []);

  const transcribeWhisperBlob = useCallback(async (blob: Blob) => {
    if (whisperCancelledRef.current) {
      // The user cancelled before we even started uploading — nothing to do.
      setStatus('idle');
      setListening(false);
      fireWhisperEnd();
      return;
    }
    setStatus('uploading');
    let base64: string;
    try {
      base64 = await blobToBase64(blob);
    } catch (e) {
      reportError('transcription-failed', 'Could not read recorded audio.');
      setStatus('idle');
      setListening(false);
      fireWhisperEnd();
      return;
    }

    if (whisperCancelledRef.current) {
      // Cancelled while we were base64-encoding — bail out without uploading.
      setStatus('idle');
      setListening(false);
      fireWhisperEnd();
      return;
    }

    const controller = new AbortController();
    cancelTranscribeRef.current = controller;
    setStatus('transcribing');
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, language: lang }),
        signal: controller.signal,
      });
      if (!res.ok) {
        if (whisperCancelledRef.current) {
          // Late response after user cancelled — drop it silently.
        } else {
          let serverMsg = '';
          try {
            const j = await res.json();
            serverMsg = j?.error || '';
          } catch { /* ignore */ }
          if (res.status === 401) {
            reportError(
              'transcription-failed',
              'You need to be signed in to use cloud dictation.',
            );
          } else {
            reportError(
              'transcription-failed',
              serverMsg || `Transcription failed (${res.status}).`,
            );
          }
        }
      } else {
        const data = (await res.json()) as { text?: string };
        const text = (data?.text || '').trim();
        // Drop late results that arrived after the user explicitly stopped.
        if (text && !whisperCancelledRef.current) {
          callbacksRef.current.onFinalTranscript?.(text);
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || whisperCancelledRef.current) {
        // user-cancelled — no error
      } else {
        reportError('transcription-failed', 'Could not reach the transcription service.');
      }
    } finally {
      cancelTranscribeRef.current = null;
      setStatus('idle');
      setListening(false);
      setInterimTranscript('');
      fireWhisperEnd();
    }
  }, [lang, reportError]);

  const startWhisper = useCallback(async () => {
    if (!whisperSupported) {
      reportError(
        'unsupported',
        'Cloud dictation requires microphone recording, which this browser does not support.',
      );
      return;
    }
    // Synchronous re-entry guard: rapid repeated clicks during the brief
    // mic-permission window must not trigger a second getUserMedia call.
    if (whisperStartingRef.current || mediaRecorderRef.current) {
      return;
    }
    whisperStartingRef.current = true;
    setError(null);
    setStatus('starting');
    whisperCancelledRef.current = false;
    whisperOnEndFiredRef.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: any) {
      whisperStartingRef.current = false;
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        reportError(
          'not-allowed',
          'Microphone access was blocked. Please allow mic access in your browser to use dictation.',
        );
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        reportError('audio-capture', 'No microphone was found. Please connect a mic and try again.');
      } else {
        reportError('unknown', 'Could not access the microphone.');
      }
      setStatus('idle');
      return;
    }

    // The user may have hit Cancel/Esc while we were waiting for mic
    // permission. Tear the stream down immediately rather than starting to
    // record into something they already abandoned.
    if (whisperCancelledRef.current) {
      stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
      whisperStartingRef.current = false;
      setStatus('idle');
      setListening(false);
      fireWhisperEnd();
      return;
    }

    mediaStreamRef.current = stream;
    const mimeType = pickRecorderMime();
    recorderMimeRef.current = mimeType;
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        cleanupWhisper();
        reportError('unsupported', 'This browser cannot record audio for cloud dictation.');
        setStatus('idle');
        return;
      }
    }

    recordedChunksRef.current = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        recordedChunksRef.current.push(ev.data);
      }
    };
    recorder.onerror = () => {
      whisperStartingRef.current = false;
      reportError('audio-capture', 'Recording was interrupted. Please try again.');
      cleanupWhisper();
      setStatus('idle');
      setListening(false);
      fireWhisperEnd();
    };
    recorder.onstop = () => {
      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      // Free the mic immediately so the OS indicator turns off
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* ignore */ }
        });
        mediaStreamRef.current = null;
      }
      mediaRecorderRef.current = null;
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
        maxDurationTimerRef.current = null;
      }
      const totalBytes = chunks.reduce((n, b) => n + b.size, 0);
      if (totalBytes === 0) {
        setStatus('idle');
        setListening(false);
        fireWhisperEnd();
        return;
      }
      const blob = new Blob(chunks, { type: recorderMimeRef.current || 'audio/webm' });
      void transcribeWhisperBlob(blob);
    };

    mediaRecorderRef.current = recorder;
    try {
      recorder.start();
    } catch (e) {
      whisperStartingRef.current = false;
      cleanupWhisper();
      reportError('audio-capture', 'Could not start recording. Please try again.');
      setStatus('idle');
      return;
    }

    whisperStartingRef.current = false;
    setListening(true);
    setStatus('recording');
    callbacksRef.current.onStart?.();

    // Safety auto-stop so we never upload an unbounded recording.
    maxDurationTimerRef.current = setTimeout(() => {
      const r = mediaRecorderRef.current;
      if (r && r.state !== 'inactive') {
        try { r.stop(); } catch { /* ignore */ }
      }
    }, WHISPER_MAX_DURATION_MS);
  }, [whisperSupported, reportError, cleanupWhisper, transcribeWhisperBlob]);

  const stopWhisper = useCallback(() => {
    // If startWhisper is mid-flight (waiting on getUserMedia), set the
    // cancelled flag so the in-progress start tears down the stream and
    // exits cleanly when its promise resolves.
    if (whisperStartingRef.current) {
      whisperCancelledRef.current = true;
      return;
    }

    const r = mediaRecorderRef.current;
    if (r && r.state !== 'inactive') {
      // Recorder is still running — let it stop normally so the onstop
      // handler can collect the chunks and send them for transcription.
      try { r.stop(); } catch { /* ignore */ }
      return;
    }

    // Recorder already finished. If a transcription request is in-flight
    // (uploading or transcribing), this stop call is a user-initiated cancel:
    // abort the request and suppress any late results.
    if (cancelTranscribeRef.current) {
      whisperCancelledRef.current = true;
      try { cancelTranscribeRef.current.abort(); } catch { /* ignore */ }
      cancelTranscribeRef.current = null;
      setStatus('idle');
      setListening(false);
      setInterimTranscript('');
      fireWhisperEnd();
      return;
    }

    // Nothing to do — ensure any leftover state is cleared.
    cleanupWhisper();
    setStatus('idle');
    setListening(false);
  }, [cleanupWhisper]);

  // Cleanup whisper on unmount
  useEffect(() => {
    return () => {
      if (cancelTranscribeRef.current) {
        try { cancelTranscribeRef.current.abort(); } catch { /* ignore */ }
        cancelTranscribeRef.current = null;
      }
      cleanupWhisper();
    };
  }, [cleanupWhisper]);

  // ---------------- Public API ----------------
  const start = useCallback(() => {
    if (!supported) {
      const err: DictationError = {
        kind: 'unsupported',
        message:
          activeEngine === 'whisper'
            ? 'Cloud dictation requires microphone recording, which this browser does not support.'
            : 'Voice dictation is not supported in this browser. Try Chrome, Edge, or Safari.',
      };
      setError(err);
      callbacksRef.current.onError?.(err);
      return;
    }

    if (activeEngine === 'whisper') {
      void startWhisper();
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
  }, [supported, activeEngine, startWhisper]);

  const stop = useCallback(() => {
    if (activeEngine === 'whisper') {
      stopWhisper();
      return;
    }
    wantListeningRef.current = false;
    setInterimTranscript('');
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  }, [activeEngine, stopWhisper]);

  const toggle = useCallback(() => {
    if (listening || status === 'uploading' || status === 'transcribing') stop();
    else start();
  }, [listening, status, start, stop]);

  // Stop listening when the tab becomes hidden to avoid stuck states
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (!document.hidden) return;
      if (activeEngine === 'web-speech' && wantListeningRef.current) {
        stop();
      } else if (activeEngine === 'whisper' && listening) {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop, activeEngine, listening]);

  return {
    supported,
    webSpeechSupported,
    whisperSupported,
    activeEngine,
    listening,
    status,
    interimTranscript,
    error,
    start,
    stop,
    toggle,
  };
}

/**
 * Convert a raw spoken-transcript chunk into typed text.
 * Maps simple punctuation commands and "new line"/"new paragraph" markers.
 */
export function normalizeDictation(raw: string): { text: string; newlines: number; trailingNewlines: number } {
  let s = raw;

  // Replace explicit newline commands with markers we can split on.
  // "new paragraph" = double newline (paragraph break); "new line" = single newline.
  s = s.replace(/\bnew paragraph\b/gi, '\n\n');
  s = s.replace(/\b(new line|next line|line break)\b/gi, '\n');

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
