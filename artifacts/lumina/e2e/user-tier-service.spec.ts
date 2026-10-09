import { test, expect } from '@playwright/test';
import {
  addBonusQueries, dailyAiQueryStorageKey, getAIQueriesRemaining,
  getDailyAIQueriesRemaining, getLocalDateKey, getNextLocalMidnightDelay,
  getNextTierRefreshDelay, isFreeTrialActive, isPremium,
  setCurrentTierUser, useAiQuery,
} from '../src/services/userTierService';
import { bonusQueriesStorageKey, premiumStorageKey } from '../src/hooks/useAdRewards';

const now = new Date();
now.setHours(12, 0, 0, 0);
const oldSignup = new Date(now.getTime() - 30 * 86400000).toISOString();
let values: Map<string, string>;

test.beforeEach(() => {
  values = new Map();
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      },
      dispatchEvent: events.dispatchEvent.bind(events),
    },
  });
  setCurrentTierUser({ id: 'account-a', createdAt: oldSignup });
});

test.afterEach(() => {
  setCurrentTierUser(null);
  Reflect.deleteProperty(globalThis, 'window');
});

test('five daily replies, then bonus replies, then blocked', () => {
  addBonusQueries(2);
  expect(getAIQueriesRemaining(now)).toBe(7);
  for (let i = 0; i < 5; i++) expect(useAiQuery(now)).toBe(true);
  expect(getDailyAIQueriesRemaining(now)).toBe(0);
  expect(values.get(bonusQueriesStorageKey('account-a'))).toBe('2');
  expect(useAiQuery(now)).toBe(true);
  expect(useAiQuery(now)).toBe(true);
  expect(getAIQueriesRemaining(now)).toBe(0);
  expect(useAiQuery(now)).toBe(false);
});

test('local midnight resets daily usage but preserves bonus credits', () => {
  addBonusQueries(2);
  for (let i = 0; i < 5; i++) useAiQuery(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  expect(getAIQueriesRemaining(tomorrow)).toBe(7);
  expect(useAiQuery(tomorrow)).toBe(true);
  expect(getAIQueriesRemaining(tomorrow)).toBe(6);
  expect(values.get(bonusQueriesStorageKey('account-a'))).toBe('2');
  expect(getLocalDateKey(new Date(2026, 9, 8, 23, 59))).toBe('2026-10-08');
  expect(getNextLocalMidnightDelay(new Date(2026, 9, 8, 23, 59, 59))).toBe(1000);
});

test('trial ends exactly seven days after signup and never consumes rewards', () => {
  const signup = new Date(now.getTime() - 7 * 86400000 + 1000);
  setCurrentTierUser({ id: 'account-a', createdAt: signup.toISOString() });
  addBonusQueries(2);
  expect(isFreeTrialActive(now)).toBe(true);
  expect(getAIQueriesRemaining(now)).toBe(Infinity);
  expect(useAiQuery(now)).toBe(true);
  expect(JSON.parse(values.get(dailyAiQueryStorageKey('account-a'))!).count).toBe(0);
  expect(values.get(bonusQueriesStorageKey('account-a'))).toBe('2');
  expect(getNextTierRefreshDelay(now)).toBe(1050);
  const end = new Date(now.getTime() + 1000);
  expect(isFreeTrialActive(end)).toBe(false);
  expect(getAIQueriesRemaining(end)).toBe(7);
});

test('premium access is unlimited without using daily or bonus credits', () => {
  values.set(premiumStorageKey('account-a'), 'true');
  addBonusQueries(2);
  expect(isPremium()).toBe(true);
  for (let i = 0; i < 8; i++) expect(useAiQuery(now)).toBe(true);
  expect(getAIQueriesRemaining(now)).toBe(Infinity);
  expect(JSON.parse(values.get(dailyAiQueryStorageKey('account-a'))!).count).toBe(0);
  expect(values.get(bonusQueriesStorageKey('account-a'))).toBe('2');
});

test('account switching and signing out isolate balances', () => {
  useAiQuery(now);
  addBonusQueries(2);
  setCurrentTierUser({ id: 'account-b', createdAt: oldSignup });
  expect(getAIQueriesRemaining(now)).toBe(5);
  useAiQuery(now);
  setCurrentTierUser({ id: 'account-a', createdAt: oldSignup });
  expect(getAIQueriesRemaining(now)).toBe(6);
  setCurrentTierUser(null);
  expect(getAIQueriesRemaining(now)).toBe(0);
  expect(useAiQuery(now)).toBe(false);
  expect(() => addBonusQueries(2)).toThrow();
});

test('unavailable device storage fails closed and invalid rewards are rejected', () => {
  expect(() => addBonusQueries(-1)).toThrow();
  expect(() => addBonusQueries(1.5)).toThrow();
  Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('blocked'); } });
  expect(getAIQueriesRemaining(now)).toBe(0);
  expect(useAiQuery(now)).toBe(false);
});
