import { getCurrentTierUser } from "./tierAccount";

export const FREE_DAILY_AI_QUERY_LIMIT = 5;
export const DAILY_AI_QUERY_STORAGE_PREFIX = "lumina_ai_daily_queries:";
export const BONUS_QUERIES_STORAGE_PREFIX = "lumina_admob_bonus_queries:";
export const AI_QUERY_STATE_CHANGED_EVENT = "lumina:ai-query-state-changed";

export interface QueryUsage {
  date: string;
  count: number;
  /** Bonus allowance granted for this day, including bonus queries already used. */
  bonus: number;
}

export function dailyAiQueryStorageKey(accountId: string): string {
  return `${DAILY_AI_QUERY_STORAGE_PREFIX}${encodeURIComponent(accountId)}`;
}

export function bonusQueriesStorageKey(accountId: string): string {
  return `${BONUS_QUERIES_STORAGE_PREFIX}${encodeURIComponent(accountId)}`;
}

export function getLocalDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function wholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function availableBonus(usage: QueryUsage): number {
  return Math.max(0, usage.bonus - Math.max(0, usage.count - FREE_DAILY_AI_QUERY_LIMIT));
}

function writeUsage(accountId: string, usage: QueryUsage, notify = true): void {
  window.localStorage.setItem(dailyAiQueryStorageKey(accountId), JSON.stringify(usage));
  // Compatibility mirror for older builds; the combined record is authoritative.
  window.localStorage.setItem(bonusQueriesStorageKey(accountId), String(availableBonus(usage)));
  if (notify) {
    window.dispatchEvent(new CustomEvent(AI_QUERY_STATE_CHANGED_EVENT, { detail: { accountId } }));
    window.dispatchEvent(new CustomEvent("lumina:admob-account-state", { detail: { accountId } }));
  }
}

export function getQueryUsageForAccount(accountId: string, now = new Date()): QueryUsage {
  const today = getLocalDateKey(now);
  const unavailable = { date: today, count: FREE_DAILY_AI_QUERY_LIMIT, bonus: 0 };
  if (!accountId || typeof window === "undefined") return unavailable;
  try {
    const stored = window.localStorage.getItem(dailyAiQueryStorageKey(accountId));
    const value = stored ? JSON.parse(stored) : null;
    let usage: QueryUsage;
    if (value && typeof value === "object" && wholeNumber(value.count) && wholeNumber(value.bonus) &&
        typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
      usage = { date: value.date, count: value.count, bonus: value.bonus };
    } else {
      // Migrate the previous split daily/bonus records without losing ad rewards.
      const legacyBonus = Number(window.localStorage.getItem(bonusQueriesStorageKey(accountId)) ?? 0);
      if (value && (!wholeNumber(value.used) || typeof value.date !== "string")) return unavailable;
      usage = {
        date: value?.date ?? today,
        count: Math.min(value?.used ?? 0, FREE_DAILY_AI_QUERY_LIMIT),
        bonus: wholeNumber(legacyBonus) ? legacyBonus : 0,
      };
    }
    const needsMigration = !value || !("count" in value);
    if (usage.date !== today) {
      usage = { date: today, count: 0, bonus: availableBonus(usage) };
      writeUsage(accountId, usage, false);
    } else if (needsMigration) {
      writeUsage(accountId, usage, false);
    }
    return usage;
  } catch {
    return unavailable;
  }
}

/** Remaining free allowance plus unspent rewards; signed-out users get zero. */
export function getRemainingQueries(now = new Date()): number {
  const user = getCurrentTierUser();
  if (!user) return 0;
  const usage = getQueryUsageForAccount(user.id, now);
  return Math.max(0, FREE_DAILY_AI_QUERY_LIMIT - usage.count + usage.bonus);
}

/** Charge one allowed request before sending it; return the new daily count. */
export function incrementQuery(now = new Date()): number {
  const user = getCurrentTierUser();
  if (!user) throw new Error("A signed-in account is required.");
  const usage = getQueryUsageForAccount(user.id, now);
  if (FREE_DAILY_AI_QUERY_LIMIT - usage.count + usage.bonus <= 0) {
    throw new Error("Your daily AI query limit has been reached.");
  }
  if (!Number.isSafeInteger(usage.count + 1)) throw new Error("The query count is too large.");
  writeUsage(user.id, { ...usage, count: usage.count + 1 });
  return usage.count + 1;
}

export function addBonusQueriesForAccount(accountId: string, amount: number): number {
  if (!accountId) throw new Error("A signed-in account is required.");
  if (!wholeNumber(amount) || amount < 1) throw new Error("Bonus query credits must be a positive whole number.");
  const usage = getQueryUsageForAccount(accountId);
  if (!Number.isSafeInteger(usage.bonus + amount)) throw new Error("The bonus query balance is too large.");
  const next = { ...usage, bonus: usage.bonus + amount };
  writeUsage(accountId, next);
  return availableBonus(next);
}

export function addBonusQueries(amount: number): number {
  const user = getCurrentTierUser();
  if (!user) throw new Error("A signed-in account is required.");
  return addBonusQueriesForAccount(user.id, amount);
}

export function consumeBonusQueryForAccount(accountId: string): boolean {
  const usage = getQueryUsageForAccount(accountId);
  if (!accountId || availableBonus(usage) < 1) return false;
  writeUsage(accountId, { ...usage, bonus: usage.bonus - 1 });
  return true;
}
