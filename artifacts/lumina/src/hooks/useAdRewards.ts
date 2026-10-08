import { useCallback, useEffect, useState } from "react";

export const PREMIUM_STORAGE_PREFIX = "lumina_admob_premium:";
export const BONUS_QUERIES_STORAGE_PREFIX = "lumina_admob_bonus_queries:";
const AD_REWARDS_CHANGED_EVENT = "lumina:admob-account-state";

function accountStorageKey(prefix: string, accountId: string) {
  return `${prefix}${encodeURIComponent(accountId)}`;
}

export function premiumStorageKey(accountId: string) {
  return accountStorageKey(PREMIUM_STORAGE_PREFIX, accountId);
}

export function bonusQueriesStorageKey(accountId: string) {
  return accountStorageKey(BONUS_QUERIES_STORAGE_PREFIX, accountId);
}

export function isPremiumAccount(accountId: string | null | undefined): boolean {
  if (!accountId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(premiumStorageKey(accountId)) === "true";
  } catch {
    return false;
  }
}

function getBonusQueryBalance(accountId: string | null | undefined): number {
  if (!accountId || typeof window === "undefined") return 0;
  try {
    const stored = window.localStorage.getItem(bonusQueriesStorageKey(accountId));
    const parsed = stored === null ? 0 : Number(stored);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function getBonusAIQueriesForAccount(accountId: string | null | undefined): number {
  return getBonusQueryBalance(accountId);
}

export function addBonusAIQueriesForAccount(accountId: string, amount: number): number {
  if (!accountId) throw new Error("A signed-in account is required.");
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("Bonus query credits must be a positive whole number.");
  }

  const nextBalance = getBonusQueryBalance(accountId) + amount;
  if (!Number.isSafeInteger(nextBalance)) {
    throw new Error("The bonus query balance is too large.");
  }
  window.localStorage.setItem(bonusQueriesStorageKey(accountId), String(nextBalance));
  window.dispatchEvent(
    new CustomEvent(AD_REWARDS_CHANGED_EVENT, { detail: { accountId } }),
  );
  return nextBalance;
}

export function consumeBonusAIQueryForAccount(accountId: string): boolean {
  if (!accountId || isPremiumAccount(accountId)) return false;
  const currentBalance = getBonusQueryBalance(accountId);
  if (currentBalance < 1) return false;

  window.localStorage.setItem(
    bonusQueriesStorageKey(accountId),
    String(currentBalance - 1),
  );
  window.dispatchEvent(
    new CustomEvent(AD_REWARDS_CHANGED_EVENT, { detail: { accountId } }),
  );
  return true;
}

export function setPremiumAccountStatus(accountId: string, isPremium: boolean) {
  if (!accountId) throw new Error("A signed-in account is required.");
  window.localStorage.setItem(
    premiumStorageKey(accountId),
    isPremium ? "true" : "false",
  );
  window.dispatchEvent(
    new CustomEvent(AD_REWARDS_CHANGED_EVENT, {
      detail: { accountId },
    }),
  );
}

interface AccountState {
  accountId: string | null;
  isPremium: boolean;
  bonusAIQueries: number;
}

export function useAdRewards(accountId: string | null) {
  const [snapshot, setSnapshot] = useState<AccountState>(() => ({
    accountId,
    isPremium: isPremiumAccount(accountId),
    bonusAIQueries: getBonusQueryBalance(accountId),
  }));

  const isPremium =
    snapshot.accountId === accountId
      ? snapshot.isPremium
      : isPremiumAccount(accountId);
  const bonusAIQueries =
    snapshot.accountId === accountId
      ? snapshot.bonusAIQueries
      : getBonusQueryBalance(accountId);

  const refresh = useCallback(() => {
    setSnapshot({
      accountId,
      isPremium: isPremiumAccount(accountId),
      bonusAIQueries: getBonusQueryBalance(accountId),
    });
  }, [accountId]);

  useEffect(() => {
    refresh();

    const onAdRewardsChanged = (event: Event) => {
      const changedAccountId = (
        event as CustomEvent<{ accountId?: string }>
      ).detail?.accountId;
      if (changedAccountId === accountId) refresh();
    };

    const onStorageChanged = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === premiumStorageKey(accountId ?? "") ||
        event.key === bonusQueriesStorageKey(accountId ?? "")
      ) {
        refresh();
      }
    };

    window.addEventListener(AD_REWARDS_CHANGED_EVENT, onAdRewardsChanged);
    window.addEventListener("storage", onStorageChanged);
    return () => {
      window.removeEventListener(AD_REWARDS_CHANGED_EVENT, onAdRewardsChanged);
      window.removeEventListener("storage", onStorageChanged);
    };
  }, [accountId, refresh]);

  const addBonusAIQueries = useCallback(
    (amount: number) => {
      if (!accountId) throw new Error("A signed-in account is required.");
      const nextBalance = addBonusAIQueriesForAccount(accountId, amount);
      setSnapshot({
        accountId,
        isPremium: isPremiumAccount(accountId),
        bonusAIQueries: nextBalance,
      });
      window.dispatchEvent(
        new CustomEvent(AD_REWARDS_CHANGED_EVENT, {
          detail: { accountId },
        }),
      );
      return nextBalance;
    },
    [accountId],
  );

  const consumeBonusAIQuery = useCallback(() => {
    if (!accountId || isPremiumAccount(accountId)) return false;
    if (!consumeBonusAIQueryForAccount(accountId)) return false;
    const nextBalance = getBonusQueryBalance(accountId);
    setSnapshot({ accountId, isPremium: false, bonusAIQueries: nextBalance });
    return true;
  }, [accountId]);

  return { isPremium, bonusAIQueries, addBonusAIQueries, consumeBonusAIQuery };
}
