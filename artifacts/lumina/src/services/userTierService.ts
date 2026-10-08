import {
  addBonusAIQueriesForAccount,
  bonusQueriesStorageKey,
  consumeBonusAIQueryForAccount,
  getBonusAIQueriesForAccount,
  isPremiumAccount,
} from "@/hooks/useAdRewards";

export const FREE_TRIAL_DAYS = 7;
export const FREE_DAILY_AI_QUERY_LIMIT = 5;
export const DAILY_AI_QUERY_STORAGE_PREFIX = "lumina_ai_daily_queries:";
export const AI_QUERY_STATE_CHANGED_EVENT = "lumina:ai-query-state-changed";

const DAY_MS = 24 * 60 * 60 * 1000;

interface TierUser {
  id: string;
  createdAt: string;
}

interface DailyUsage {
  date: string;
  used: number;
}

let currentUser: TierUser | null = null;

export function setCurrentTierUser(user: TierUser | null): void {
  currentUser = user;
}

export function dailyAiQueryStorageKey(accountId: string): string {
  return `${DAILY_AI_QUERY_STORAGE_PREFIX}${encodeURIComponent(accountId)}`;
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDailyUsage(accountId: string, date = new Date()): DailyUsage {
  const today = getLocalDateKey(date);
  if (typeof window === "undefined") {
    return { date: today, used: FREE_DAILY_AI_QUERY_LIMIT };
  }

  try {
    const stored = window.localStorage.getItem(dailyAiQueryStorageKey(accountId));
    if (!stored) return { date: today, used: 0 };
    const value: unknown = JSON.parse(stored);
    if (
      value &&
      typeof value === "object" &&
      "date" in value &&
      value.date === today &&
      "used" in value &&
      typeof value.used === "number" &&
      Number.isSafeInteger(value.used) &&
      value.used >= 0
    ) {
      return { date: today, used: Math.min(value.used, FREE_DAILY_AI_QUERY_LIMIT) };
    }
    return { date: today, used: 0 };
  } catch {
    return { date: today, used: FREE_DAILY_AI_QUERY_LIMIT };
  }
}

function dispatchTierChange(accountId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AI_QUERY_STATE_CHANGED_EVENT, { detail: { accountId } }),
  );
}

export function isPremium(): boolean {
  return isPremiumAccount(currentUser?.id);
}

export function isFreeTrialActive(now = new Date()): boolean {
  if (!currentUser) return false;
  const createdAt = Date.parse(currentUser.createdAt);
  if (!Number.isFinite(createdAt) || now.getTime() < createdAt) return false;
  return now.getTime() < createdAt + FREE_TRIAL_DAYS * DAY_MS;
}

export function getFreeTrialDaysRemaining(now = new Date()): number {
  if (!currentUser) return 0;
  const createdAt = Date.parse(currentUser.createdAt);
  if (!Number.isFinite(createdAt)) return 0;
  const remaining = createdAt + FREE_TRIAL_DAYS * DAY_MS - now.getTime();
  return remaining > 0 ? Math.ceil(remaining / DAY_MS) : 0;
}

export function getDailyAIQueriesRemaining(now = new Date()): number {
  if (!currentUser) return 0;
  const usage = getDailyUsage(currentUser.id, now);
  return Math.max(0, FREE_DAILY_AI_QUERY_LIMIT - usage.used);
}

export function getAIQueriesRemaining(now = new Date()): number {
  if (!currentUser) return 0;
  if (isPremium() || isFreeTrialActive(now)) return Number.POSITIVE_INFINITY;
  return (
    getDailyAIQueriesRemaining(now) +
    getBonusAIQueriesForAccount(currentUser.id)
  );
}

/** Call only after a Coach request has completed with a nonempty response. */
export function useAiQuery(now = new Date()): boolean {
  if (!currentUser) return false;
  if (isPremium() || isFreeTrialActive(now)) return true;

  const usage = getDailyUsage(currentUser.id, now);
  if (usage.used < FREE_DAILY_AI_QUERY_LIMIT) {
    if (typeof window === "undefined") return false;
    try {
      window.localStorage.setItem(
        dailyAiQueryStorageKey(currentUser.id),
        JSON.stringify({ date: getLocalDateKey(now), used: usage.used + 1 }),
      );
    } catch {
      return false;
    }
    dispatchTierChange(currentUser.id);
    return true;
  }

  const consumed = consumeBonusAIQueryForAccount(currentUser.id);
  if (consumed) dispatchTierChange(currentUser.id);
  return consumed;
}

export function addBonusQueries(amount: number): number {
  if (!currentUser) throw new Error("A signed-in account is required.");
  const balance = addBonusAIQueriesForAccount(currentUser.id, amount);
  dispatchTierChange(currentUser.id);
  return balance;
}

export function getNextLocalMidnightDelay(now = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return Math.max(1, nextMidnight.getTime() - now.getTime());
}

export function getNextTierRefreshDelay(now = new Date()): number {
  let delay = getNextLocalMidnightDelay(now);
  if (currentUser && !isPremium()) {
    const createdAt = Date.parse(currentUser.createdAt);
    const trialEndsAt = createdAt + FREE_TRIAL_DAYS * DAY_MS;
    if (Number.isFinite(createdAt) && trialEndsAt > now.getTime()) {
      delay = Math.min(delay, trialEndsAt - now.getTime());
    }
  }
  return Math.max(1, delay + 50);
}
