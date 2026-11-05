import { createHash } from "node:crypto";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { billingEmailDeliveries, db, type User } from "@workspace/db";
import type { VerifiedSubscription } from "./subscriptions";
import { getVerifiedFirebaseEmail } from "./subscriptionFirebase";

export type PremiumEmailResult = "sent" | "already-sent" | "in-progress" | "not-eligible" | "not-configured";
type EmailUser = Pick<User, "id" | "firebaseUid">;
type DeliveryClaim = "claimed" | "sent" | "busy";
type SendEmailInput = {
  from: string;
  to: string;
  webAppUrl: string;
  idempotencyKey: string;
};

type EmailServiceDependencies = {
  getVerifiedEmail: (uid: string) => Promise<string | null>;
  claim: (input: { accountId: string; accessKey: string; recipientEmail: string }) => Promise<DeliveryClaim>;
  markSent: (accountId: string, accessKey: string, providerEmailId: string | null) => Promise<void>;
  markPending: (accountId: string, accessKey: string) => Promise<void>;
  send: (input: SendEmailInput) => Promise<string | null>;
  getSender: () => string | null;
  getWebAppUrl: () => string | null;
};

function normalizeWebAppUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function withDeliveryTimeout<T>(task: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Premium email delivery timed out.")), 12_000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export function createPremiumAccessEmailService(dependencies: EmailServiceDependencies) {
  return async (user: EmailUser, subscription: VerifiedSubscription): Promise<PremiumEmailResult> => {
    if (subscription.tier !== "premium" || !user.firebaseUid) return "not-eligible";
    const from = dependencies.getSender();
    const webAppUrl = normalizeWebAppUrl(dependencies.getWebAppUrl());
    if (!from || from.length > 320 || /[\r\n]/.test(from) || !from.includes("@") || !webAppUrl) {
      return "not-configured";
    }

    const recipientEmail = await dependencies.getVerifiedEmail(user.firebaseUid);
    if (!recipientEmail) return "not-eligible";
    const accessKey = subscription.subscriptionId ?? "manual-premium";
    const claim = await dependencies.claim({ accountId: user.id, accessKey, recipientEmail });
    if (claim === "sent") return "already-sent";
    if (claim === "busy") return "in-progress";

    const idempotencyKey = `lumina-premium-${createHash("sha256")
      .update(`${user.id}\n${accessKey}`).digest("hex")}`;
    try {
      const providerEmailId = await withDeliveryTimeout(
        dependencies.send({ from, to: recipientEmail, webAppUrl, idempotencyKey }),
      );
      await dependencies.markSent(user.id, accessKey, providerEmailId);
      return "sent";
    } catch (error) {
      await dependencies.markPending(user.id, accessKey);
      throw error;
    }
  };
}

async function claimDelivery(input: {
  accountId: string;
  accessKey: string;
  recipientEmail: string;
}): Promise<DeliveryClaim> {
  const now = new Date();
  const [created] = await db.insert(billingEmailDeliveries).values({
    ...input, status: "sending", attempts: 1, updatedAt: now,
  }).onConflictDoNothing().returning({ accountId: billingEmailDeliveries.accountId });
  if (created) return "claimed";

  const where = and(
    eq(billingEmailDeliveries.accountId, input.accountId),
    eq(billingEmailDeliveries.accessKey, input.accessKey),
  );
  const [existing] = await db.select({ status: billingEmailDeliveries.status })
    .from(billingEmailDeliveries).where(where).limit(1);
  if (existing?.status === "sent") return "sent";

  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const [claimed] = await db.update(billingEmailDeliveries).set({
    status: "sending",
    recipientEmail: input.recipientEmail,
    attempts: sql`${billingEmailDeliveries.attempts} + 1`,
    lastError: null,
    updatedAt: now,
  }).where(and(where, or(
    eq(billingEmailDeliveries.status, "pending"),
    and(eq(billingEmailDeliveries.status, "sending"), lt(billingEmailDeliveries.updatedAt, staleBefore)),
  ))).returning({ accountId: billingEmailDeliveries.accountId });
  return claimed ? "claimed" : "busy";
}

async function markSent(accountId: string, accessKey: string, providerEmailId: string | null): Promise<void> {
  await db.update(billingEmailDeliveries).set({
    status: "sent", providerEmailId, lastError: null, sentAt: new Date(), updatedAt: new Date(),
  }).where(and(
    eq(billingEmailDeliveries.accountId, accountId),
    eq(billingEmailDeliveries.accessKey, accessKey),
  ));
}

async function markPending(accountId: string, accessKey: string): Promise<void> {
  await db.update(billingEmailDeliveries).set({
    status: "pending", lastError: "Resend delivery failed.", updatedAt: new Date(),
  }).where(and(
    eq(billingEmailDeliveries.accountId, accountId),
    eq(billingEmailDeliveries.accessKey, accessKey),
  ));
}

const connectors = new ReplitConnectors();
async function sendWithResend(input: SendEmailInput): Promise<string | null> {
  const htmlUrl = input.webAppUrl.replaceAll("&", "&amp;").replaceAll("\"", "&quot;");
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: "Your Lumina Premium access is active",
      html: `<p>Your Premium access is active.</p><p>Sign in to Lumina with the Google account associated with your Premium access. For a paid subscription, use the same Google account used for the purchase.</p><p><a href="${htmlUrl}">Open Lumina</a></p><p>This link only opens the app. It does not grant access; Lumina checks your account’s server-verified entitlement after sign-in.</p>`,
      text: `Your Premium access is active.\n\nSign in to Lumina with the Google account associated with your Premium access. For a paid subscription, use the same Google account used for the purchase.\n\nOpen Lumina: ${input.webAppUrl}\n\nThis link only opens the app. It does not grant access; Lumina checks your account’s server-verified entitlement after sign-in.`,
    }),
  });
  if (!response.ok) throw new Error(`Resend rejected the billing email (${response.status}).`);
  const result = await response.json().catch(() => null) as { id?: unknown } | null;
  return typeof result?.id === "string" ? result.id : null;
}

export const deliverPremiumAccessEmail = createPremiumAccessEmailService({
  getVerifiedEmail: getVerifiedFirebaseEmail,
  claim: claimDelivery,
  markSent,
  markPending,
  send: sendWithResend,
  getSender: () => process.env.LUMINA_BILLING_EMAIL_FROM?.trim() || null,
  // Resolved from Replit's deployment metadata; override when the published domain changes.
  getWebAppUrl: () => process.env.LUMINA_WEB_APP_URL || "https://creative-writing-assistant.replit.app",
});
