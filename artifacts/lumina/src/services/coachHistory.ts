export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CoachHistory {
  messages: CoachMessage[];
  draft: string;
}

const PREFIX = 'lumina_coach_history:v1:';
export const COACH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const COACH_MAX_EXCHANGES = 40;
export const COACH_RETENTION_LABEL = 'Saved on this device for 30 days after your last change · up to 40 exchanges per document.';

export function coachHistoryKey(accountId: string, documentId: number) {
  return `${PREFIX}${encodeURIComponent(accountId)}:${documentId}`;
}

function isHistory(value: unknown): value is CoachHistory & { updatedAt: number } {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
    && typeof entry.draft === 'string' && Array.isArray(entry.messages)
    && entry.messages.length <= COACH_MAX_EXCHANGES * 2
    && entry.messages.length % 2 === 0
    && entry.messages.every((message, index) => message
      && message.role === (index % 2 === 0 ? 'user' : 'assistant')
      && typeof message.content === 'string' && message.content.trim().length > 0);
}

// Expired or malformed entries are removed when Coach is opened or updated.
// Reading does not extend retention; only changing a draft or completing a reply does.
function prune(storage: Storage, now: number) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (!key?.startsWith(PREFIX)) continue;
    let entry: unknown;
    try { entry = JSON.parse(storage.getItem(key) ?? 'null'); } catch { entry = null; }
    if (!isHistory(entry) || entry.updatedAt > now || now - entry.updatedAt >= COACH_RETENTION_MS) {
      storage.removeItem(key);
    }
  }
}

export function readCoachHistory(accountId: string, documentId: number, now = Date.now()): CoachHistory {
  const storage = window.localStorage;
  prune(storage, now);
  const entry = JSON.parse(storage.getItem(coachHistoryKey(accountId, documentId)) ?? 'null');
  return isHistory(entry) ? { messages: entry.messages, draft: entry.draft } : { messages: [], draft: '' };
}

export function writeCoachHistory(accountId: string, documentId: number, history: CoachHistory, now = Date.now()) {
  const storage = window.localStorage;
  prune(storage, now);
  const key = coachHistoryKey(accountId, documentId);
  if (!history.messages.length && !history.draft) {
    storage.removeItem(key);
    return;
  }
  const entry = { ...history, messages: history.messages.slice(-COACH_MAX_EXCHANGES * 2), updatedAt: now };
  if (!isHistory(entry)) throw new Error('Only completed Coach exchanges can be saved.');
  storage.setItem(key, JSON.stringify(entry));
}

export function clearCoachHistory(accountId: string, documentId: number) {
  window.localStorage.removeItem(coachHistoryKey(accountId, documentId));
}
