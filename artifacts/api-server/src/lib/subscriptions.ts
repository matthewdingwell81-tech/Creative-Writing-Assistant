import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { SignJWT, exportJWK } from "jose";
import { ReplitConnectors } from "@replit/connectors-sdk";
import type { SubscriptionState } from "@workspace/api-zod";

export const RC_PROJECT_ID = "projc174b989";
export const RC_ANDROID_APP_ID = "appd4e4b7a907";
export const RC_ENTITLEMENT_ID = "entla69f102c5e";
export const MANAGEMENT_URL = "https://play.google.com/store/account/subscriptions?sku=lumina_premium&package=com.lumina.app";
const connectors = new ReplitConnectors();
export type VerifiedSubscription = Omit<SubscriptionState, "receipt" | "firebaseSync">;

interface RevenueCatSubscription {
  id: string;
  gives_access: boolean;
  ends_at: number | null;
  current_period_ends_at: number | null;
  auto_renewal_status: string;
  entitlements: { items: { id: string }[] };
}
interface ActiveEntitlement { entitlement_id: string; expires_at: number | null }

/** No price comparison: store price changes never invalidate a paid receipt. */
export function subscriptionFromRevenueCat(
  accountId: string, subscriptions: RevenueCatSubscription[], active: ActiveEntitlement[], now = Date.now(),
): VerifiedSubscription {
  const premium = subscriptions.filter(s => s.entitlements.items.some(e => e.id === RC_ENTITLEMENT_ID));
  const entitlement = active.find(e => e.entitlement_id === RC_ENTITLEMENT_ID);
  const latest = premium.sort((a, b) => Number(b.gives_access) - Number(a.gives_access) ||
    (b.ends_at ?? b.current_period_ends_at ?? 0) - (a.ends_at ?? a.current_period_ends_at ?? 0))[0];
  const expiresAt = entitlement?.expires_at ?? latest?.ends_at ?? latest?.current_period_ends_at ?? null;
  const hasAccess = Boolean(entitlement && latest?.gives_access && expiresAt !== null && expiresAt > now);
  return {
    accountId, tier: hasAccess ? "premium" : "free",
    status: hasAccess ? latest.auto_renewal_status === "will_not_renew" ? "cancelled" : "active" : latest ? "expired" : "none",
    subscriptionId: latest?.id ?? null, expiresAt, verifiedAt: now,
  };
}

export async function revenueCat(path: string): Promise<any> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("RevenueCat verification timed out.")), 12_000);
  });
  try {
    return await Promise.race([(async () => {
      const response = await connectors.proxy("revenuecat", path, { method: "GET" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`RevenueCat verification unavailable (${response.status}).`);
      return response.json();
    })(), timeout]);
  } finally { clearTimeout(timer); }
}
async function list(path: string): Promise<any[]> {
  const result: any[] = [];
  let next: string | null = path;
  while (next) {
    const page = await revenueCat(next);
    if (!page) return [];
    result.push(...page.items);
    // Only provider-owned pagination can select the next resource.
    next = page.next_page ? new URL(page.next_page, "https://api.revenuecat.com").pathname +
      new URL(page.next_page, "https://api.revenuecat.com").search : null;
    if (result.length > 10_000) throw new Error("Subscription history is too large.");
  }
  return result;
}

const inFlight = new Map<string, Promise<VerifiedSubscription>>();
export function verifyRevenueCatSubscription(accountId: string): Promise<VerifiedSubscription> {
  const existing = inFlight.get(accountId);
  if (existing) return existing;
  const path = `/v2/projects/${RC_PROJECT_ID}/customers/${encodeURIComponent(`lumina:${accountId}`)}`;
  const task = (async () => {
    const [subscriptions, entitlements] = await Promise.all([
      list(`${path}/subscriptions`), list(`${path}/active_entitlements`),
    ]);
    return subscriptionFromRevenueCat(accountId, subscriptions, entitlements);
  })().finally(() => inFlight.delete(accountId));
  inFlight.set(accountId, task);
  return task;
}

function signingKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for verification receipts.");
  // Domain-separated deterministic Ed25519 key; restart does not invalidate
  // offline receipts. The private seed never leaves the backend.
  const seed = createHash("sha256").update(`lumina:billing:receipt:v1\0${secret}`).digest();
  return createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
}
export async function receiptPublicKey() { return exportJWK(createPublicKey(signingKey())); }
export async function signVerificationReceipt(subscription: VerifiedSubscription): Promise<string> {
  const expiry = Math.min(subscription.expiresAt ?? Infinity, subscription.verifiedAt + 24 * 60 * 60 * 1000);
  // Free/expired snapshots need a short-lived signature too; never grant access
  // based on them, but keep status history available in the online UI.
  const exp = subscription.tier === "premium" ? expiry : subscription.verifiedAt + 24 * 60 * 60 * 1000;
  return new SignJWT({ subscription }).setProtectedHeader({ alg: "EdDSA" })
    .setIssuer("lumina-billing").setAudience("lumina-premium").setSubject(subscription.accountId)
    .setIssuedAt(Math.floor(subscription.verifiedAt / 1000)).setExpirationTime(Math.floor(exp / 1000))
    .sign(signingKey());
}
