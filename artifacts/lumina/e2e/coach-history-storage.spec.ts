import { test, expect } from '@playwright/test';
import {
  clearCoachHistory, coachHistoryKey, COACH_MAX_EXCHANGES, COACH_RETENTION_MS,
  readCoachHistory, writeCoachHistory, type CoachMessage,
} from '../src/services/coachHistory';

let values: Map<string, string>;
const now = 1_800_000_000_000;
const pair: CoachMessage[] = [{ role: 'user', content: 'Question' }, { role: 'assistant', content: 'Completed reply' }];

test.beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: {
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } },
  });
});
test.afterEach(() => { Reflect.deleteProperty(globalThis, 'window'); });

test('completed messages and drafts survive reads, isolated by account and document', () => {
  writeCoachHistory('a:b', 1, { messages: pair, draft: 'Next question' }, now);
  expect(readCoachHistory('a:b', 1, now)).toEqual({ messages: pair, draft: 'Next question' });
  expect(readCoachHistory('a:b', 2, now)).toEqual({ messages: [], draft: '' });
  expect(readCoachHistory('b', 1, now)).toEqual({ messages: [], draft: '' });
});

test('expires at 30 days; reads do not renew retention and other browser state is untouched', () => {
  values.set('unrelated', 'keep');
  writeCoachHistory('a', 1, { messages: pair, draft: '' }, now);
  expect(readCoachHistory('a', 1, now + COACH_RETENTION_MS - 1).messages).toEqual(pair);
  expect(readCoachHistory('a', 1, now + COACH_RETENTION_MS).messages).toEqual([]);
  expect(values.has(coachHistoryKey('a', 1))).toBe(false);
  expect(values.get('unrelated')).toBe('keep');
});

test('draft edits renew retention and reset removes only this conversation', () => {
  writeCoachHistory('a', 1, { messages: pair, draft: '' }, now);
  writeCoachHistory('a', 2, { messages: pair, draft: '' }, now);
  clearCoachHistory('a', 1);
  expect(readCoachHistory('a', 2, now).messages).toEqual(pair);
  expect(readCoachHistory('a', 1, now).messages).toEqual([]);
  writeCoachHistory('a', 1, { messages: pair, draft: 'Draft' }, now + 1000);
  expect(readCoachHistory('a', 1, now + COACH_RETENTION_MS).draft).toBe('Draft');
  clearCoachHistory('a', 1);
  expect(values.has(coachHistoryKey('a', 1))).toBe(false);
});

test('bounds history to 40 whole exchanges and refuses pending or empty replies', () => {
  const messages = Array.from({ length: COACH_MAX_EXCHANGES + 3 }, (_, i) => [
    { role: 'user' as const, content: `Question ${i}` }, { role: 'assistant' as const, content: `Reply ${i}` },
  ]).flat();
  writeCoachHistory('a', 1, { messages, draft: '' }, now);
  const restored = readCoachHistory('a', 1, now);
  expect(restored.messages).toHaveLength(80);
  expect(restored.messages[0].content).toBe('Question 3');
  expect(() => writeCoachHistory('a', 2, { messages: [pair[0]], draft: '' }, now)).toThrow();
  expect(() => writeCoachHistory('a', 2, { messages: [pair[0], { role: 'assistant', content: ' ' }], draft: '' }, now)).toThrow();
  expect(values.has(coachHistoryKey('a', 2))).toBe(false);
});

test('corrupt and future-dated entries are discarded without loading their content', () => {
  values.set(coachHistoryKey('a', 1), '{bad');
  values.set(coachHistoryKey('a', 2), JSON.stringify({ updatedAt: now + 1, messages: pair, draft: 'bad' }));
  expect(readCoachHistory('a', 1, now)).toEqual({ messages: [], draft: '' });
  expect(readCoachHistory('a', 2, now)).toEqual({ messages: [], draft: '' });
  expect(values.size).toBe(0);
});

test('storage errors are explicit rather than pretending persistence succeeded', () => {
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked'); } });
  expect(() => readCoachHistory('a', 1, now)).toThrow('Blocked');
  expect(() => writeCoachHistory('a', 1, { messages: pair, draft: '' }, now)).toThrow('Blocked');
  expect(() => clearCoachHistory('a', 1)).toThrow('Blocked');
});
