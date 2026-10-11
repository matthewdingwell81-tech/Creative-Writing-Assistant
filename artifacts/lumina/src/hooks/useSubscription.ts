import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { SubscriptionState } from "@workspace/api-client-react";
import { useAuth } from "./useAuth";
import {
  getMonthlyPackage, hasPendingPurchase, loadOfflineSubscription, manageSubscription,
  nativePurchasesAvailable, purchasePremium, restorePurchase, retryVerification,
  verifyPurchase, watchPurchaseUpdates,
} from "@/lib/purchase";
import { applySubscription, forgetSubscription, getVerifiedSubscription, SUBSCRIPTION_CHANGED } from "@/lib/subscriptionCache";
import { setPremiumAccountStatus } from "./useAdRewards";
import { setPremiumCompatibilityMirror } from "@/lib/premiumMirror";
import { SubscriptionStartup } from "@/components/SubscriptionStartup";

export interface SubscriptionContextValue {
  subscription: SubscriptionState | null;
  isPremium: boolean;
  loading: boolean;
  busy: boolean;
  price: string | null;
  error: string | null;
  message: string | null;
  offline: boolean;
  nativeAvailable: boolean;
  pendingVerification: boolean;
  purchase: () => Promise<void>;
  restore: () => Promise<void>;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
  manage: () => Promise<void>;
}
const context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [pendingVerification, setPending] = useState(false);
  const activeId = useRef(user?.id);
  activeId.current = user?.id;
  const refreshTask = useRef<Promise<void> | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [readyAccount, setReadyAccount] = useState<string | null>(null);
  const [settledAccount, setSettledAccount] = useState<string | null>(null);

  const refresh = (): Promise<void> => {
    if (refreshTask.current) return refreshTask.current;
    const id = user?.id;
    if (!id) return Promise.resolve();
    const epoch = generation.current;
    const controller = new AbortController();
    refreshController.current = controller;
    const isActive = () => activeId.current === id && generation.current === epoch;
    const task = (async () => {
      try {
        const result = await verifyPurchase(controller.signal);
        if (!isActive()) return;
        setSubscription(result); setOffline(false); setError(null);
        setReadyAccount(id);
      } catch {
        if (!isActive() || controller.signal.aborted) return;
        const cached = await loadOfflineSubscription(id, controller.signal);
        if (!isActive()) return;
        const previous = getVerifiedSubscription(id);
        setSubscription(cached ?? (previous?.status === "expired" ? previous : null)); setOffline(true);
        if (cached) setReadyAccount(id);
        else {
          setPremiumAccountStatus(id, false);
          setPremiumCompatibilityMirror(false);
        }
        setError(cached
          ? "You're offline. Verified Premium access is available for up to 24 hours, or until your subscription expires."
          : "Subscription verification is unavailable. Retry when you're connected.");
      } finally {
        if (isActive()) {
          setLoading(false); setSettledAccount(id); setPending(hasPendingPurchase(id));
        }
      }
    })().finally(() => {
      if (refreshTask.current === task) refreshTask.current = null;
      if (refreshController.current === controller) refreshController.current = null;
    });
    refreshTask.current = task;
    return task;
  };

  useEffect(() => {
    generation.current++;
    const id = user?.id;
    let disposed = false;
    let stopNative: (() => void) | undefined;
    setSubscription(null); setPrice(null); setError(null); setMessage(null); setBusy(false);
    setOffline(false); setLoading(Boolean(id)); refreshTask.current = null;
    setReadyAccount(null);
    setSettledAccount(null);
    if (!id) return;
    void refresh();
    if (nativePurchasesAvailable()) {
      void getMonthlyPackage().then(pkg => { if (!disposed) setPrice(pkg.product.priceString); }).catch(err => {
        if (!disposed) setMessage(err instanceof Error ? err.message : "Store pricing is unavailable.");
      });
      void watchPurchaseUpdates(id, () => { void refresh(); }).then(stop => {
        if (disposed) stop(); else stopNative = stop;
      }).catch(() => { /* Price/verification failures are surfaced above. */ });
    }
    const updated = (event: Event) => {
      const state = (event as CustomEvent<SubscriptionState>).detail;
      if (!disposed && activeId.current === id && state.accountId === id) {
        setSubscription(state); setPending(hasPendingPurchase(id));
      }
    };
    const focused = () => { if (document.visibilityState === "visible") void refresh(); };
    const storage = (event: StorageEvent) => {
      if (event.key === `lumina_verified_subscription:${encodeURIComponent(id)}`) void refresh();
    };
    const timer = window.setInterval(() => {
      const verified = getVerifiedSubscription(id);
      if (verified?.status === "expired") { applySubscription(verified); setSubscription(verified); }
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    window.addEventListener(SUBSCRIPTION_CHANGED, updated);
    window.addEventListener("online", focused);
    window.addEventListener("focus", focused);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", focused);
    return () => {
      generation.current++;
      refreshController.current?.abort();
      disposed = true; stopNative?.(); forgetSubscription(id);
      clearInterval(timer);
      window.removeEventListener(SUBSCRIPTION_CHANGED, updated);
      window.removeEventListener("online", focused);
      window.removeEventListener("focus", focused);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", focused);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!subscription || subscription.accountId !== user?.id || subscription.tier !== "premium") return;
    const epoch = generation.current;
    const expires = Math.min(subscription.expiresAt ?? Infinity, subscription.verifiedAt + 24 * 60 * 60 * 1000);
    const timer = window.setTimeout(() => {
      if (generation.current !== epoch || activeId.current !== subscription.accountId) return;
      const expired: SubscriptionState = { ...subscription, tier: "free", status: "expired" };
      applySubscription(expired); setSubscription(expired); void refresh();
    }, Math.min(2_147_483_647, Math.max(0, expires - Date.now())));
    return () => clearTimeout(timer);
  }, [subscription, user?.id]);

  const run = async (action: () => Promise<SubscriptionState>, restored = false) => {
    const id = user?.id;
    if (!id || busy) return;
    const epoch = generation.current;
    const isActive = () => activeId.current === id && generation.current === epoch;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await action();
      if (!isActive()) return;
      setSubscription(result); setOffline(false);
      setMessage(result.tier === "premium" ? "Premium is active. Enjoy unlimited AI queries and no ads."
        : restored ? "No active Premium purchase was found for this store account." : "Your subscription has been refreshed.");
    } catch (err) {
      if (isActive()) setError(err instanceof Error ? err.message : "Please retry verification.");
    } finally {
      if (isActive()) { setBusy(false); setPending(hasPendingPurchase(id)); }
    }
  };
  const isPremium = subscription?.accountId === user?.id && subscription?.tier === "premium"
    && (subscription.expiresAt === null || subscription.expiresAt > Date.now())
    && Date.now() - subscription.verifiedAt < 24 * 60 * 60 * 1000;
  const startupBlocked = Boolean(user && readyAccount !== user.id);
  const visibleSubscription = subscription?.accountId === user?.id ? subscription : null;
  return createElement(context.Provider, { value: {
    subscription: visibleSubscription, isPremium, loading: loading || startupBlocked,
    busy, price, error, message, offline,
    nativeAvailable: nativePurchasesAvailable(), pendingVerification,
    purchase: () => run(purchasePremium), restore: () => run(restorePurchase, true),
    retry: () => run(retryVerification), refresh,
    manage: async () => { try { await manageSubscription(); } catch { setError("Could not open subscription management. Please try again."); } },
  } }, !authLoading && startupBlocked
    ? createElement(SubscriptionStartup, {
        loading: loading || settledAccount !== user?.id,
        error, retry: () => { setLoading(true); void refresh(); },
        signOut: () => { void logout().catch(() => setError("Could not sign out. Please try again.")); },
      })
    : children);
}
export function useSubscription(): SubscriptionContextValue {
  const value = useContext(context);
  if (!value) throw new Error("SubscriptionProvider is required.");
  return value;
}
