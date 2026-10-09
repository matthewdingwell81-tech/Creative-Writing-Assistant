import { test, expect } from '@playwright/test';
import {
  addBonusQueries, dailyAiQueryStorageKey, getLocalDateKey,
  getQueryUsageForAccount, getRemainingQueries, incrementQuery,
} from '../src/lib/queryTracker';
import { setCurrentTierUser } from '../src/lib/tierAccount';

let values: Map<string, string>;
const now = () => new Date();

test.beforeEach(() => {
  values = new Map();
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      dispatchEvent: events.dispatchEvent.bind(events),
    },
  });
  setCurrentTierUser({ id: 'tracker-a', createdAt: '2020-01-01' });
});

test.afterEach(() => {
  setCurrentTierUser(null);
  Reflect.deleteProperty(globalThis, 'window');
});

test('combined payload counts attempts and includes rewarded allowance', () => {
  expect(getRemainingQueries()).toBe(5);
  addBonusQueries(2);
  for (let count = 1; count <= 3; count++) expect(incrementQuery()).toBe(count);
  expect(JSON.parse(values.get(dailyAiQueryStorageKey('tracker-a'))!)).toEqual({
    date: getLocalDateKey(), count: 3, bonus: 2,
  });
  expect(getRemainingQueries()).toBe(4);
  for (let count = 4; count <= 7; count++) expect(incrementQuery()).toBe(count);
  expect(getRemainingQueries()).toBe(0);
  expect(() => incrementQuery()).toThrow('limit');
});

test('midnight carries only unspent bonuses and resets count', () => {
  addBonusQueries(3);
  for (let i = 0; i < 6; i++) incrementQuery();
  const tomorrow = now();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  expect(getQueryUsageForAccount('tracker-a', tomorrow)).toEqual({
    date: getLocalDateKey(tomorrow), count: 0, bonus: 2,
  });
  expect(getRemainingQueries(tomorrow)).toBe(7);
});

test('legacy records migrate without losing credits; accounts remain isolated', () => {
  values.set(dailyAiQueryStorageKey('tracker-a'), JSON.stringify({ date: getLocalDateKey(), used: 5 }));
  values.set('lumina_admob_bonus_queries:tracker-a', '2');
  expect(getRemainingQueries()).toBe(2);
  expect(incrementQuery()).toBe(6);
  setCurrentTierUser({ id: 'tracker-b', createdAt: '2020-01-01' });
  expect(getRemainingQueries()).toBe(5);
  setCurrentTierUser(null);
  expect(getRemainingQueries()).toBe(0);
  expect(() => incrementQuery()).toThrow('signed-in');
});
