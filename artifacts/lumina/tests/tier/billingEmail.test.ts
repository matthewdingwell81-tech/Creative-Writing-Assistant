// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@replit/connectors-sdk", () => ({ ReplitConnectors: class {} }));
import { createPremiumAccessEmailService, resolveBillingEmailSender } from "../../../api-server/src/lib/billingEmail";
import type { VerifiedSubscription } from "../../../api-server/src/lib/subscriptions";

const state: VerifiedSubscription = {
  accountId: "account", tier: "premium", status: "active", subscriptionId: "paid-subscription",
  expiresAt: Date.now() + 86400000, verifiedAt: Date.now(),
};
function fixture(sender: string | null = "onboarding@resend.dev") {
  const rows = new Map<string, "sending" | "pending" | "sent">();
  const send = vi.fn().mockResolvedValue("email-id");
  const verifiedEmail = vi.fn().mockResolvedValue("verified@example.test");
  const claim = vi.fn(async (input: { accountId: string; accessKey: string; recipientEmail: string }) => {
    const status = rows.get(input.accessKey);
    if (status === "sent") return "sent" as const;
    if (status === "sending") return "busy" as const;
    rows.set(input.accessKey, "sending");
    return "claimed" as const;
  });
  const deliver = createPremiumAccessEmailService({
    getVerifiedEmail: verifiedEmail, claim, send,
    markSent: async (_account, key) => { rows.set(key, "sent"); },
    markPending: async (_account, key) => { rows.set(key, "pending"); },
    getSender: () => sender,
    getWebAppUrl: () => "https://lumina.example.test/?not-an-unlock=true#ignored",
  });
  return { deliver, send, verifiedEmail, rows, claim };
}
describe("Premium confirmation email safety", () => {
  it("uses only the Firebase-verified email and suppresses concurrent/repeated sends", async () => {
    const f = fixture();
    const user = { id: "account", firebaseUid: "verified-firebase-uid" };
    await Promise.all([f.deliver(user, state), f.deliver(user, state)]);
    expect(await f.deliver(user, state)).toBe("already-sent");
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.verifiedEmail).toHaveBeenCalledWith("verified-firebase-uid");
    expect(f.send.mock.calls[0][0]).toMatchObject({
      from: "onboarding@resend.dev", to: "verified@example.test", webAppUrl: "https://lumina.example.test",
    });
  });
  it("retries failures with the same provider idempotency key", async () => {
    const f = fixture();
    const user = { id: "account", firebaseUid: "firebase" };
    f.send.mockRejectedValueOnce(new Error("temporary provider failure"));
    await expect(f.deliver(user, state)).rejects.toThrow("temporary provider failure");
    expect(f.rows.get("paid-subscription")).toBe("pending");
    expect(await f.deliver(user, state)).toBe("sent");
    expect(f.send.mock.calls[0][0].idempotencyKey).toBe(f.send.mock.calls[1][0].idempotencyKey);
  });
  it("does not email Free, unlinked, or unverified accounts", async () => {
    const f = fixture();
    expect(await f.deliver({ id: "account", firebaseUid: "uid" }, { ...state, tier: "free" })).toBe("not-eligible");
    expect(await f.deliver({ id: "account", firebaseUid: null }, state)).toBe("not-eligible");
    f.verifiedEmail.mockResolvedValue(null);
    expect(await f.deliver({ id: "account", firebaseUid: "uid" }, state)).toBe("not-eligible");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("uses a separate one-time key for complimentary access", async () => {
    const f = fixture();
    await f.deliver({ id: "account", firebaseUid: "uid" }, { ...state, subscriptionId: null, expiresAt: null });
    expect(f.claim.mock.calls[0][0].accessKey).toBe("manual-premium");
  });
  it("leaves delivery disabled when no sender is configured", async () => {
    const f = fixture(null);
    expect(await f.deliver({ id: "account", firebaseUid: "uid" }, state)).toBe("not-configured");
    expect(f.send).not.toHaveBeenCalled();
    expect(f.claim).not.toHaveBeenCalled();
  });
});

describe("configurable sender and test-only Resend address", () => {
  it("never substitutes a sender for missing configuration", () => {
    expect(resolveBillingEmailSender(undefined, "production")).toBeNull();
    expect(resolveBillingEmailSender("", "development")).toBeNull();
  });
  it("allows an explicitly configured Resend test sender only in development/test", () => {
    expect(resolveBillingEmailSender("onboarding@resend.dev", "test")).toBe("onboarding@resend.dev");
    expect(resolveBillingEmailSender("onboarding@resend.dev", "development")).toBe("onboarding@resend.dev");
    expect(resolveBillingEmailSender("Lumina <onboarding@resend.dev>", "production")).toBeNull();
    expect(resolveBillingEmailSender("onboarding@RESEND.DEV", undefined)).toBeNull();
  });
  it("retains the explicitly configured custom sender without inventing verification", () => {
    expect(resolveBillingEmailSender(" Lumina <billing@example.test> ", "production"))
      .toBe("Lumina <billing@example.test>");
  });
});
