import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type {} from "pino-http";
import { eq } from "drizzle-orm";
import { db, users, type User } from "@workspace/db";
import {
  GetBillingConfigurationResponse, RefreshSubscriptionBody, GetSubscriptionResponse, ReceiveSubscriptionEventBody,
} from "@workspace/api-zod";
import { verifyFirebaseIdToken } from "../lib/firebaseAuth";
import {
  RC_PROJECT_ID, RC_ANDROID_APP_ID, MANAGEMENT_URL, receiptPublicKey, revenueCat,
  signVerificationReceipt, verifyRevenueCatSubscription,
  developerSubscription,
} from "../lib/subscriptions";
import { syncSubscriptionToFirebase } from "../lib/subscriptionFirebase";
import { storage } from "../storage";

let publicApiKey: string | null = null;
async function verifiedState(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error("Account not found.");
  const subscription = developerSubscription(id, user.firebaseUid) ?? await verifyRevenueCatSubscription(id);
  let firebaseSync: "not-linked" | "synced" | "unavailable" = "not-linked";
  if (user.firebaseUid) {
    try { firebaseSync = await syncSubscriptionToFirebase(user.firebaseUid, subscription) ? "synced" : "unavailable"; }
    catch { firebaseSync = "unavailable"; }
  }
  return GetSubscriptionResponse.parse({
    ...subscription, receipt: await signVerificationReceipt(subscription), firebaseSync,
  });
}

type BillingRouterDependencies = {
  getUserById: (id: string) => Promise<User | undefined>;
  linkFirebaseUser: typeof storage.linkFirebaseUser;
  verifyFirebaseIdToken: typeof verifyFirebaseIdToken;
  verifiedState: typeof verifiedState;
};

export function createBillingRouter(overrides: Partial<BillingRouterDependencies> = {}) {
  const getUserById = overrides.getUserById ?? (async (id: string) => {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  });
  const linkFirebaseUser = overrides.linkFirebaseUser ?? storage.linkFirebaseUser.bind(storage);
  const verifyFirebaseToken = overrides.verifyFirebaseIdToken ?? verifyFirebaseIdToken;
  const getVerifiedState = overrides.verifiedState ?? verifiedState;
  const router = Router();

  router.get("/billing/config", async (req, res) => {
    if (!req.session.userId) { res.status(401).json({ error: "Sign in required." }); return; }
    try {
      if (!publicApiKey) {
        const keys = await revenueCat(`/v2/projects/${RC_PROJECT_ID}/apps/${RC_ANDROID_APP_ID}/public_api_keys`);
        publicApiKey = keys?.items?.find((key: { key: string }) => key.key.startsWith("goog_"))?.key ?? null;
        if (!publicApiKey) throw new Error("Google Play public SDK key unavailable.");
      }
      res.json(GetBillingConfigurationResponse.parse({
        androidApiKey: publicApiKey, entitlementIdentifier: "premium",
        receiptPublicKey: await receiptPublicKey(), managementUrl: MANAGEMENT_URL,
      }));
    } catch (error) {
      req.log.warn({ err: error }, "Billing configuration unavailable");
      res.status(503).json({ error: "Billing setup is temporarily unavailable. Please retry." });
    }
  });

  router.get("/billing/subscription", async (req, res) => {
    if (!req.session.userId) { res.status(401).json({ error: "Sign in required." }); return; }
    try { res.json(await getVerifiedState(req.session.userId)); }
    catch (error) {
      req.log.warn({ err: error }, "Subscription verification unavailable");
      res.status(503).json({ error: "Unable to verify your subscription. Retry verification; do not purchase again." });
    }
  });
  router.post("/billing/subscription", async (req, res) => {
    if (!req.session.userId) { res.status(401).json({ error: "Sign in required." }); return; }
    const parsed = RefreshSubscriptionBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid verification request." }); return; }
    try {
      if (parsed.data.firebaseIdToken) {
        let firebaseUser;
        try { firebaseUser = await verifyFirebaseToken(parsed.data.firebaseIdToken); }
        catch { res.status(403).json({ error: "Google account verification failed. Sign in again." }); return; }
        const user = await getUserById(req.session.userId);
        if (!user || (user.firebaseUid
          ? user.firebaseUid !== firebaseUser.uid
          : user.username.toLowerCase() !== firebaseUser.email.toLowerCase())) {
          res.status(403).json({ error: "Google account does not match your Lumina account." }); return;
        }
        if (!user.firebaseUid && !await linkFirebaseUser(user.id, firebaseUser.uid)) {
          res.status(403).json({ error: "Account is already linked to a different Firebase identity." }); return;
        }
      }
      res.json(await getVerifiedState(req.session.userId));
    } catch (error) {
      req.log.warn({ err: error }, "Subscription verification unavailable");
      res.status(503).json({ error: "Unable to verify your subscription. Retry verification; do not purchase again." });
    }
  });

  router.post("/billing/webhook", async (req, res) => {
    const expected = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;
    const received = req.get("authorization") ?? "";
    if (!expected) { res.status(503).json({ error: "Webhook is not configured." }); return; }
    if (Buffer.byteLength(expected) !== Buffer.byteLength(received) ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
      res.status(401).json({ error: "Invalid webhook authorization." }); return;
    }
    const parsed = ReceiveSubscriptionEventBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid subscription event." }); return; }
    const event = parsed.data.event;
    const customerIds = [...new Set([event.app_user_id, ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
      .filter((id): id is string => Boolean(id?.startsWith("lumina:"))))];
    if (!customerIds.length) { res.sendStatus(204); return; }
    try {
      // Read current state, never apply event-supplied tier/expiry. Old, duplicated
      // or reordered cancellation/renewal/expiration events cannot roll it back.
      for (const customerId of customerIds) {
        const id = customerId.slice("lumina:".length);
        const user = await getUserById(id);
        if (!user) continue;
        const state = await getVerifiedState(id);
        if (state.firebaseSync === "unavailable") throw new Error("Firebase subscription sync is unavailable.");
      }
      res.sendStatus(204);
    } catch (error) {
      req.log.warn({ err: error }, "Subscription event must be retried");
      res.status(503).json({ error: "Retry subscription event delivery." });
    }
  });
  return router;
}

export default createBillingRouter();
