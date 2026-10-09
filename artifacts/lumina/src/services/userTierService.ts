import { isPremiumAccount } from "@/hooks/useAdRewards";
import { getCurrentTierUser } from "@/lib/tierAccount";
import {
  FREE_DAILY_AI_QUERY_LIMIT, getQueryUsageForAccount, getRemainingQueries,
  incrementQuery,
} from "@/lib/queryTracker";

// Compatibility exports: all consumers share the same account and usage record.
export { setCurrentTierUser, isCurrentTierUser } from "@/lib/tierAccount";
export {
  FREE_DAILY_AI_QUERY_LIMIT, DAILY_AI_QUERY_STORAGE_PREFIX,
  AI_QUERY_STATE_CHANGED_EVENT, dailyAiQueryStorageKey, getLocalDateKey,
  addBonusQueries,
} from "@/lib/queryTracker";

export const FREE_TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isPremium(): boolean {
  return isPremiumAccount(getCurrentTierUser()?.id);
}

export function isFreeTrialActive(now = new Date()): boolean {
  const currentUser = getCurrentTierUser();
  if (!currentUser) return false;
  const createdAt = Date.parse(currentUser.createdAt);
  if (!Number.isFinite(createdAt) || now.getTime() < createdAt) return false;
  return now.getTime() < createdAt + FREE_TRIAL_DAYS * DAY_MS;
}

export function getFreeTrialDaysRemaining(now = new Date()): number {
  const currentUser = getCurrentTierUser();
  if (!currentUser) return 0;
  const createdAt = Date.parse(currentUser.createdAt);
  if (!Number.isFinite(createdAt)) return 0;
  const remaining = createdAt + FREE_TRIAL_DAYS * DAY_MS - now.getTime();
  return remaining > 0 ? Math.ceil(remaining / DAY_MS) : 0;
}

export function getDailyAIQueriesRemaining(now = new Date()): number {
  const currentUser = getCurrentTierUser();
  if (!currentUser) return 0;
  return Math.max(0, FREE_DAILY_AI_QUERY_LIMIT - getQueryUsageForAccount(currentUser.id, now).count);
}

export function getAIQueriesRemaining(now = new Date()): number {
  if (!getCurrentTierUser()) return 0;
  if (isPremium() || isFreeTrialActive(now)) return Number.POSITIVE_INFINITY;
  return getRemainingQueries(now);
}

/** Legacy boolean helper. Coach charges before sending, never on stream completion. */
export function useAiQuery(now = new Date()): boolean {
  if (!getCurrentTierUser()) return false;
  if (isPremium() || isFreeTrialActive(now)) return true;
  try {
    incrementQuery(now);
    return true;
  } catch {
    return false;
  }
}

export function getNextLocalMidnightDelay(now = new Date()): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, nextMidnight.getTime() - now.getTime());
}

export function getNextTierRefreshDelay(now = new Date()): number {
  let delay = getNextLocalMidnightDelay(now);
  const currentUser = getCurrentTierUser();
  if (currentUser && !isPremium()) {
    const createdAt = Date.parse(currentUser.createdAt);
    const trialEndsAt = createdAt + FREE_TRIAL_DAYS * DAY_MS;
    if (Number.isFinite(createdAt) && trialEndsAt > now.getTime()) {
      delay = Math.min(delay, trialEndsAt - now.getTime());
    }
  }
  return Math.max(1, delay + 50);
}
