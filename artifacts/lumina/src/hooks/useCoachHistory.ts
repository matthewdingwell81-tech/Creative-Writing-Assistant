import { useEffect, useRef, useState } from 'react';
import { getCoachHistory, saveCoachHistory, deleteCoachHistory, type CoachHistorySnapshot } from '@workspace/api-client-react';
import {
  clearCoachHistory, readDeviceCoachHistory, writeCoachHistory, COACH_MAX_EXCHANGES,
  type CoachHistory, type CoachMessage,
} from '@/services/coachHistory';

// A remount waits for the previous instance's writes, including its final draft
// flush. Requests never use an account ID supplied by the client.
const queues = new Map<string, Promise<unknown>>();
function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const pending = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  queues.set(key, pending);
  void pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); }).catch(() => {});
  return pending;
}

export function useCoachHistory(userId: string | null, documentId: number) {
  const key = `${userId}:${documentId}`;
  const retained = useRef<CoachHistory>({ messages: [], draft: '' });
  const revision = useRef(0);
  const ready = useRef(false);
  const alive = useRef(true);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [deviceHistory, setDeviceHistory] = useState<ReturnType<typeof readDeviceCoachHistory>>(null);

  function restore(snapshot: CoachHistorySnapshot) {
    revision.current = snapshot.revision;
    retained.current = { messages: snapshot.messages, draft: snapshot.draft };
    if (alive.current) {
      setMessages(snapshot.messages);
      setDraft(snapshot.draft);
    }
  }
  function fail(error: unknown) {
    if ((error as { status?: number })?.status === 401) {
      window.dispatchEvent(new CustomEvent('lumina:session-expired'));
    }
    blocked.current = true;
    if (alive.current) {
      setStorageError((error as { status?: number })?.status === 409
        ? 'Coach changed on another device. Your unsaved work is kept on this device. Reload saved history before continuing.'
        : 'Coach could not sync. Unsaved work stays on this device when browser storage is available. Retry loading saved history.');
      setLoading(false);
      setSyncing(false);
    }
  }
  async function load() {
    cancelTimer();
    ready.current = false;
    blocked.current = true;
    setLoading(true);
    setSyncing(false);
    try {
      const snapshot = await enqueue(key, () => getCoachHistory(documentId));
      if (!alive.current) return;
      restore(snapshot);
      setStorageError('');
      let device = null;
      try { device = userId ? readDeviceCoachHistory(userId, documentId) : null; } catch {
        setStorageError('Saved account history loaded, but device recovery storage is unavailable.');
      }
      setDeviceHistory(device);
      ready.current = true;
      blocked.current = false;
      setLoading(false);
    } catch (error) { fail(error); }
  }
  function cancelTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function persist(history: CoachHistory, version: number) {
    return enqueue(key, async () => {
      if (blocked.current) return;
      try {
        const snapshot = await saveCoachHistory(documentId, { ...history, revision: revision.current });
        revision.current = snapshot.revision;
        if (userId && version === generation.current) {
          try { clearCoachHistory(userId, documentId); } catch {
            if (alive.current) setStorageError('Coach synced, but the device recovery copy could not be removed.');
            if (alive.current && version === generation.current) setSyncing(false);
            return;
          }
        }
        if (alive.current) setStorageError('');
        if (alive.current && version === generation.current) setSyncing(false);
      } catch (error) { fail(error); }
    });
  }
  function save(history: CoachHistory, immediate = false) {
    retained.current = history;
    setSyncing(true);
    const version = ++generation.current;
    try {
      // Keep even an empty pending state: erasing a draft is a mutation too.
      if (userId) writeCoachHistory(userId, documentId, history, Date.now(), true);
    } catch {
      setStorageError('Browser recovery storage is unavailable. Keep this page open until Coach syncs.');
    }
    cancelTimer();
    if (immediate) void persist(history, version);
    else timer.current = setTimeout(() => { timer.current = null; void persist(history, version); }, 500);
  }
  useEffect(() => {
    alive.current = true;
    if (userId) void load();
    else { setLoading(false); blocked.current = true; }
    return () => {
      alive.current = false;
      if (timer.current) {
        cancelTimer();
        void persist(retained.current, generation.current);
      }
    };
  }, [key]);

  return {
    messages, setMessages, draft, setDraft, storageError, loading, syncing,
    canEdit: !loading && ready.current && !blocked.current && !deviceHistory,
    deviceHistory,
    completedMessages: retained,
    reload: load,
    async importDeviceHistory() {
      if (!deviceHistory || !userId) return;
      setLoading(true);
      try {
        const snapshot = await enqueue(key, () => saveCoachHistory(documentId, {
          messages: deviceHistory.messages, draft: deviceHistory.draft,
          revision: revision.current, importedAt: deviceHistory.updatedAt,
        }));
        clearCoachHistory(userId, documentId);
        restore(snapshot);
        setDeviceHistory(null);
        setLoading(false);
      } catch (error) { fail(error); }
    },
    discardDeviceHistory() {
      try {
        if (userId) clearCoachHistory(userId, documentId);
        setDeviceHistory(null);
      } catch { setStorageError('Device history could not be removed. Allow browser storage and try again.'); }
    },
    updateDraft(text: string) {
      if (blocked.current || !ready.current || deviceHistory) return;
      setDraft(text);
      save({ ...retained.current, draft: text });
    },
    complete(completed: CoachMessage[]) {
      const bounded = completed.slice(-COACH_MAX_EXCHANGES * 2);
      setMessages(bounded);
      setDraft('');
      save({ messages: bounded, draft: '' }, true);
    },
    async reset() {
      cancelTimer();
      setSyncing(false);
      ++generation.current;
      setLoading(true);
      blocked.current = true;
      try {
        const snapshot = await enqueue(key, () => deleteCoachHistory(documentId));
        if (userId) clearCoachHistory(userId, documentId);
        restore(snapshot);
        if (alive.current) { setDeviceHistory(null); setStorageError(''); setLoading(false); }
        blocked.current = false;
        ready.current = true;
      } catch (error) { fail(error); }
    },
  };
}
