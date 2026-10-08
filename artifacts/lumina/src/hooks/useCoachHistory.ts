import { useRef, useState } from 'react';
import {
  clearCoachHistory, readCoachHistory, writeCoachHistory, COACH_MAX_EXCHANGES,
  type CoachHistory, type CoachMessage,
} from '@/services/coachHistory';

// The caller is keyed by account + document, so its initial state and pending
// stream are replaced atomically when either identity changes.
export function useCoachHistory(userId: string | null, documentId: number) {
  const [initial] = useState(() => {
    try {
      return { history: userId ? readCoachHistory(userId, documentId) : { messages: [], draft: '' }, error: '' };
    } catch {
      return { history: { messages: [], draft: '' }, error: 'Coach history could not be loaded from this device.' };
    }
  });
  const retained = useRef<CoachHistory>(initial.history);
  const [messages, setMessages] = useState<CoachMessage[]>(initial.history.messages);
  const [draft, setDraft] = useState(initial.history.draft);
  const [storageError, setStorageError] = useState(initial.error);

  const save = (history: CoachHistory) => {
    retained.current = history;
    if (!userId) return;
    try {
      writeCoachHistory(userId, documentId, history);
      setStorageError('');
    } catch {
      setStorageError('Coach history could not be saved on this device. Keep this page open to avoid losing it.');
    }
  };

  return {
    messages, setMessages, draft, setDraft, storageError,
    completedMessages: retained,
    updateDraft(text: string) {
      setDraft(text);
      save({ ...retained.current, draft: text });
    },
    complete(completed: CoachMessage[]) {
      const bounded = completed.slice(-COACH_MAX_EXCHANGES * 2);
      setMessages(bounded);
      setDraft('');
      save({ messages: bounded, draft: '' });
    },
    reset() {
      retained.current = { messages: [], draft: '' };
      setMessages([]);
      setDraft('');
      try {
        if (userId) clearCoachHistory(userId, documentId);
        setStorageError('');
      } catch {
        setStorageError('Saved Coach history could not be cleared. Allow browser storage and try Start over again.');
      }
    },
  };
}
