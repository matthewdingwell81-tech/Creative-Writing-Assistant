import { Capacitor } from "@capacitor/core";
import { Purchases, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import {
  getBillingConfiguration, refreshSubscription,
  type BillingConfiguration, type SubscriptionState,
} from "@workspace/api-client-react";
import { auth } from "./firebase";
import { getCurrentTierUser, isCurrentTierUser } from "./tierAccount";
import { readSubscription, recordSubscription, saveSubscription } from "./subscriptionCache";

let configuration: BillingConfiguration | null = null;
let configuredAccount: string | null = null;
let configurationTask: Promise<BillingConfiguration> | null = null;
let nativeTask: Promise<void> | null = null;
let operation: Promise<SubscriptionState> | null = null;
const pendingKey = (id: string) => `lumina_purchase_pending:${encodeURIComponent(id)}`;
export const nativePurchasesAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
export const hasPendingPurchase = (id: string) => localStorage.getItem(pendingKey(id)) === "true";

export async function getPurchaseConfiguration(): Promise<BillingConfiguration> {
  if (configuration) return configuration;
  if (!configurationTask) {
    configurationTask = getBillingConfiguration().then(value => {
      configuration = value;
      try { localStorage.setItem("lumina_billing_configuration", JSON.stringify(value)); } catch { /* Optional offline cache. */ }
      return value;
    }).finally(() => { configurationTask = null; });
  }
  return configurationTask;
}

function assertAccount(id: string) {
  if (!isCurrentTierUser(id)) throw new Error("Your account changed. Please try again.");
}
function accountId(): string {
  const id = getCurrentTierUser()?.id;
  if (!id) throw new Error("Please sign in to manage your subscription.");
  return id;
}

export async function initializePurchases(id = accountId()): Promise<void> {
  if (!nativePurchasesAvailable()) throw new Error("Purchase and restore are available in the Lumina Android app.");
  if (nativeTask) await nativeTask;
  assertAccount(id);
  if (configuredAccount === id) return;
  nativeTask = (async () => {
    const config = await getPurchaseConfiguration();
    assertAccount(id);
    if (configuredAccount) await Purchases.logIn({ appUserID: `lumina:${id}` });
    else await Purchases.configure({ apiKey: config.androidApiKey, appUserID: `lumina:${id}` });
    // Set before the account check: a changed session must still logIn on its next use.
    configuredAccount = id;
    assertAccount(id);
  })();
  try { await nativeTask; } finally { nativeTask = null; }
}

export async function getMonthlyPackage(): Promise<PurchasesPackage> {
  const id = accountId();
  await initializePurchases(id);
  const offerings = await Purchases.getOfferings();
  assertAccount(id);
  const pkg = offerings.current?.monthly;
  if (!pkg) throw new Error("The monthly subscription is not available from Google Play yet. Please try again later.");
  return pkg;
}

export async function verifyPurchase(): Promise<SubscriptionState> {
  const id = accountId();
  await getPurchaseConfiguration();
  assertAccount(id);
  const session = getCurrentTierUser();
  await auth.authStateReady();
  assertAccount(id);
  const firebaseUser = auth.currentUser;
  // Never attach a leftover Google login to a username/password account.
  const matched = firebaseUser?.email?.toLowerCase() ===
    (session?.email ?? session?.username)?.toLowerCase();
  const firebaseIdToken = matched && firebaseUser ? await firebaseUser.getIdToken() : undefined;
  assertAccount(id);
  const state = await refreshSubscription({ ...(firebaseIdToken ? { firebaseIdToken } : {}) });
  assertAccount(id);
  if (state.accountId !== id) throw new Error("Subscription verification returned a different account.");
  recordSubscription(state);
  saveSubscription(state);
  if (state.tier === "premium") localStorage.removeItem(pendingKey(id));
  return state;
}

export async function restorePurchase(): Promise<SubscriptionState> {
  return exclusive(async () => {
    const id = accountId();
    await initializePurchases(id);
    await Purchases.restorePurchases();
    assertAccount(id);
    return verifyPurchase();
  });
}

function exclusive(task: () => Promise<SubscriptionState>): Promise<SubscriptionState> {
  // A second tap must never invoke a second store purchase or change SDK identity.
  if (operation) return operation;
  operation = task().finally(() => { operation = null; });
  return operation;
}

export function purchasePremium(): Promise<SubscriptionState> {
  return exclusive(async () => {
    const id = accountId();
    if (hasPendingPurchase(id)) return retryVerification();
    // Verify first: already-owned subscriptions go to management, not checkout.
    const existing = await verifyPurchase();
    if (existing.tier === "premium") return existing;
    const pkg = await getMonthlyPackage(); // Fresh store pricing on every checkout.
    assertAccount(id);
    localStorage.setItem(pendingKey(id), "true"); // Persist BEFORE opening the store.
    try {
      await Purchases.purchasePackage({ aPackage: pkg });
      assertAccount(id);
    } catch (error) {
      if ((error as { userCancelled?: boolean }).userCancelled) {
        localStorage.removeItem(pendingKey(id));
        throw new Error("Purchase cancelled. You have not been upgraded.");
      }
      throw new Error("Purchase confirmation is uncertain. Retry verification or restore your purchase; we will not start another charge.");
    }
    return retryVerification();
  });
}

export async function retryVerification(): Promise<SubscriptionState> {
  const state = await verifyPurchase();
  if (hasPendingPurchase(state.accountId) && state.tier !== "premium") {
    throw new Error("Your purchase is not confirmed yet. Retry verification or Restore Purchase. No new charge will be started.");
  }
  return state;
}

export async function loadOfflineSubscription(id: string): Promise<SubscriptionState | null> {
  try {
    const config = configuration ?? JSON.parse(localStorage.getItem("lumina_billing_configuration") ?? "null");
    if (!config) return null;
    const state = await readSubscription(id, config);
    if (state && isCurrentTierUser(id)) { recordSubscription(state); saveSubscription(state); }
    return state;
  } catch { return null; }
}

export async function manageSubscription(): Promise<void> {
  const config = await getPurchaseConfiguration().catch(() => configuration);
  // Known store-owned page; never accept an arbitrary client/receipt URL.
  const url = config?.managementUrl ?? "https://play.google.com/store/account/subscriptions?sku=lumina_premium&package=com.lumina.app";
  if (nativePurchasesAvailable()) {
    // Capacitor's BridgeWebViewClient launches external-host navigation as an
    // ACTION_VIEW intent. window.open may silently fail in the native WebView.
    window.location.assign(url);
    return;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(url);
}

export async function watchPurchaseUpdates(id: string, changed: () => void): Promise<() => void> {
  await initializePurchases(id);
  const callbackId = await Purchases.addCustomerInfoUpdateListener(() => {
    if (isCurrentTierUser(id)) changed();
  });
  return () => { void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: callbackId }); };
}
