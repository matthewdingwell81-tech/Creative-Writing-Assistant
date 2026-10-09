import { importJWK, jwtVerify } from "jose";
import type { BillingConfiguration, SubscriptionState } from "@workspace/api-client-react";
import { setPremiumAccountStatus } from "@/hooks/useAdRewards";
import { isCurrentTierUser } from "./tierAccount";

export const SUBSCRIPTION_CHANGED = "lumina:subscription-changed";
const key = (id: string) => `lumina_verified_subscription:${encodeURIComponent(id)}`;

export function applySubscription(state: SubscriptionState): void {
  if (!isCurrentTierUser(state.accountId)) return;
  const active = state.tier === "premium" && state.expiresAt !== null && state.expiresAt > Date.now();
  setPremiumAccountStatus(state.accountId, active);
  window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CHANGED, { detail: state }));
}

export function saveSubscription(state: SubscriptionState): void {
  // The native SDK retains the original store receipt. This is the backend's
  // signed verification receipt, not client-created entitlement information.
  try { localStorage.setItem(key(state.accountId), state.receipt); } catch { /* Online verification still succeeded. */ }
  applySubscription(state);
}

export async function readSubscription(id: string, config: BillingConfiguration): Promise<SubscriptionState | null> {
  try {
    const receipt = localStorage.getItem(key(id));
    if (!receipt) return null;
    const publicKey = await importJWK(config.receiptPublicKey, "EdDSA");
    const { payload } = await jwtVerify(receipt, publicKey, {
      algorithms: ["EdDSA"], issuer: "lumina-billing", audience: "lumina-premium",
    });
    const value = payload.subscription as SubscriptionState | undefined;
    if (!value || value.accountId !== id || value.expiresAt === null ||
        value.expiresAt <= Date.now() || value.verifiedAt > Date.now() ||
        Date.now() - value.verifiedAt >= 24 * 60 * 60 * 1000 ||
        !["active", "cancelled"].includes(value.status) || value.tier !== "premium") return null;
    return { ...value, receipt, firebaseSync: "unavailable" };
  } catch { return null; }
}

/** Cloud listeners must not replace a newer, server-verified store entitlement. */
const current = new Map<string, SubscriptionState>();
export function recordSubscription(state: SubscriptionState): void { current.set(state.accountId, state); }
export function getVerifiedSubscription(id: string): SubscriptionState | undefined {
  const value = current.get(id);
  if (!value) return undefined;
  if (value.tier === "premium" && (value.expiresAt === null || value.expiresAt <= Date.now() ||
      Date.now() - value.verifiedAt >= 24 * 60 * 60 * 1000)) {
    return { ...value, tier: "free", status: "expired" };
  }
  return value;
}
export function forgetSubscription(id: string): void { current.delete(id); }
