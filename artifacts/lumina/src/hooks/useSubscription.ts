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
  const { user } = useAuth();
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

  const refresh = (): Promise<void> => {
    if (refreshTask.current) return refreshTask.current;
    const id = user?.id;
    if (!id) return Promise.resolve();
    refreshTask.current = (async () => {
      try {
        const result = await verifyPurchase();
        if (activeId.current !== id) return;
        setSubscription(result); setOffline(false); setError(null);
      } catch {
        const cached = await loadOfflineSubscription(id);
        if (activeId.current !== id) return;
        const previous = getVerifiedSubscription(id);
        setSubscription(cached ?? (previous?.status === "expired" ? previous : null)); setOffline(true);
        if (!cached) setPremiumAccountStatus(id, false);
        setError(cached
          ? "You're offline. Verified Premium access is available for up to 24 hours, or until your subscription expires."
          : "Subscription verification is unavailable. Retry when you're connected.");
      } finally {
        if (activeId.current === id) { setLoading(false); setPending(hasPendingPurchase(id)); }
      }
    })().finally(() => { refreshTask.current = null; });
    return refreshTask.current;
  };

  useEffect(() => {
    const id = user?.id;
    let disposed = false;
    let stopNative: (() => void) | undefined;
    setSubscription(null); setPrice(null); setError(null); setMessage(null); setBusy(false);
    setOffline(false); setLoading(Boolean(id)); refreshTask.current = null;
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
      if (state.accountId === id) { setSubscription(state); setPending(hasPendingPurchase(id)); }
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
    if (!subscription?.expiresAt || subscription.tier !== "premium") return;
    const expires = Math.min(subscription.expiresAt, subscription.verifiedAt + 24 * 60 * 60 * 1000);
    const timer = window.setTimeout(() => {
      const expired: SubscriptionState = { ...subscription, tier: "free", status: "expired" };
      applySubscription(expired); setSubscription(expired); void refresh();
    }, Math.min(2_147_483_647, Math.max(0, expires - Date.now())));
    return () => clearTimeout(timer);
  }, [subscription]);

  const run = async (action: () => Promise<SubscriptionState>, restored = false) => {
    const id = user?.id;
    if (!id || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await action();
      if (activeId.current !== id) return;
      setSubscription(result); setOffline(false);
      setMessage(result.tier === "premium" ? "Premium is active. Enjoy unlimited AI queries and no ads."
        : restored ? "No active Premium purchase was found for this store account." : "Your subscription has been refreshed.");
    } catch (err) {
      if (activeId.current === id) setError(err instanceof Error ? err.message : "Please retry verification.");
    } finally {
      if (activeId.current === id) { setBusy(false); setPending(hasPendingPurchase(id)); }
    }
  };
  const isPremium = subscription?.tier === "premium" && subscription.expiresAt !== null && subscription.expiresAt > Date.now();
  return createElement(context.Provider, { value: {
    subscription, isPremium, loading, busy, price, error, message, offline,
    nativeAvailable: nativePurchasesAvailable(), pendingVerification,
    purchase: () => run(purchasePremium), restore: () => run(restorePurchase, true),
    retry: () => run(retryVerification), refresh,
    manage: async () => { try { await manageSubscription(); } catch { setError("Could not open subscription management. Please try again."); } },
  } }, children);
}
export function useSubscription(): SubscriptionContextValue {
  const value = useContext(context);
  if (!value) throw new Error("SubscriptionProvider is required.");
  return value;
}
