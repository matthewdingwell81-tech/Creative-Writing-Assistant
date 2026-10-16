import { afterEach, expect, it } from "vitest";
import {
  dailyAiQueryStorageKey, getLocalDateKey, getQueryUsageForAccount,
  refundQueryForAccount, availableBonus,
} from "@/lib/queryTracker";

afterEach(() => localStorage.clear());

it("refunds the original account and restores a spent bonus without altering another account", () => {
  const today = getLocalDateKey();
  localStorage.setItem(dailyAiQueryStorageKey("original"), JSON.stringify({ date: today, count: 6, bonus: 1 }));
  localStorage.setItem(dailyAiQueryStorageKey("other"), JSON.stringify({ date: today, count: 3, bonus: 0 }));
  refundQueryForAccount("original", today);
  const usage = getQueryUsageForAccount("original");
  expect(usage.count).toBe(5);
  expect(availableBonus(usage)).toBe(1);
  expect(getQueryUsageForAccount("other").count).toBe(3);
});

it("does not refund yesterday's reservation against today's requests or make counts negative", () => {
  const today = getLocalDateKey();
  localStorage.setItem(dailyAiQueryStorageKey("original"), JSON.stringify({ date: today, count: 1, bonus: 0 }));
  refundQueryForAccount("original", "2000-01-01");
  expect(getQueryUsageForAccount("original").count).toBe(1);
  refundQueryForAccount("original", today);
  refundQueryForAccount("original", today);
  expect(getQueryUsageForAccount("original").count).toBe(0);
});
