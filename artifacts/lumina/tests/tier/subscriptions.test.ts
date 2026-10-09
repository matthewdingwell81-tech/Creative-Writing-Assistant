// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { importJWK, jwtVerify } from "jose";
vi.mock("@replit/connectors-sdk", () => ({ ReplitConnectors: class {} }));
import {
  RC_ENTITLEMENT_ID, subscriptionFromRevenueCat, receiptPublicKey, signVerificationReceipt,
} from "../../../api-server/src/lib/subscriptions";

const now = 1_800_000_000_000;
const paid = (overrides = {}) => ({
  id: "subscription-1", gives_access: true, ends_at: now + 86400000,
  current_period_ends_at: now + 86400000, auto_renewal_status: "will_renew",
  entitlements: { items: [{ id: RC_ENTITLEMENT_ID }] }, ...overrides,
});
const active = [{ entitlement_id: RC_ENTITLEMENT_ID, expires_at: now + 86400000 }];
describe("authoritative subscription lifecycle", () => {
  beforeEach(() => { vi.stubEnv("SESSION_SECRET", "isolated-test-signing-secret"); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it("grants a verified active Premium subscription", () => {
    expect(subscriptionFromRevenueCat("a", [paid()], active, now)).toMatchObject({ tier: "premium", status: "active", subscriptionId: "subscription-1" });
  });
  it("keeps cancelled access until paid-through expiry", () => {
    expect(subscriptionFromRevenueCat("a", [paid({ auto_renewal_status: "will_not_renew" })], active, now))
      .toMatchObject({ tier: "premium", status: "cancelled" });
  });
  it("downgrades expired access even if stale data says gives_access", () => {
    expect(subscriptionFromRevenueCat("a", [paid()], active, now + 86400001))
      .toMatchObject({ tier: "free", status: "expired" });
  });
  it("requires both the correct entitlement and provider access", () => {
    expect(subscriptionFromRevenueCat("a", [paid({ gives_access: false })], active, now).tier).toBe("free");
    expect(subscriptionFromRevenueCat("a", [paid()], [], now).tier).toBe("free");
    expect(subscriptionFromRevenueCat("a", [paid({ entitlements: { items: [{ id: "another" }] } })], active, now).tier).toBe("free");
  });
  it("never grants an indefinite monthly subscription", () => {
    expect(subscriptionFromRevenueCat("a", [paid({ ends_at: null, current_period_ends_at: null })],
      [{ entitlement_id: RC_ENTITLEMENT_ID, expires_at: null }], now).tier).toBe("free");
  });
  it("treats unknown customers as Free, not verification errors", () => {
    expect(subscriptionFromRevenueCat("a", [], [], now)).toMatchObject({ tier: "free", status: "none" });
  });
  it("a changed store price does not revoke an existing subscription", () => {
    expect(subscriptionFromRevenueCat("a", [paid({ price: 7.99, currency: "CAD" })], active, now).tier).toBe("premium");
  });
  it("prefers a renewal over an older expired subscription", () => {
    expect(subscriptionFromRevenueCat("a", [paid({ id: "old", gives_access: false, ends_at: now - 100 }), paid()], active, now).subscriptionId)
      .toBe("subscription-1");
  });
  it("signs an account-bound offline receipt with a 24-hour ceiling", async () => {
    const state = subscriptionFromRevenueCat("a", [paid({ ends_at: now + 864000000 })],
      [{ entitlement_id: RC_ENTITLEMENT_ID, expires_at: now + 864000000 }], now);
    const receipt = await signVerificationReceipt(state);
    const key = await importJWK(await receiptPublicKey(), "EdDSA");
    const { payload } = await jwtVerify(receipt, key, {
      issuer: "lumina-billing", audience: "lumina-premium", currentDate: new Date(now),
    });
    expect(payload.sub).toBe("a");
    expect(payload.exp).toBe(Math.floor((now + 86400000) / 1000));
    const forged = receipt.slice(0, -5) + "AAAAA";
    await expect(jwtVerify(forged, key, { currentDate: new Date(now) })).rejects.toThrow();
    await expect(jwtVerify(receipt, key, { currentDate: new Date(now + 86400001) })).rejects.toThrow();
  });
  it("bounds the signed receipt by paid expiry", async () => {
    const state = subscriptionFromRevenueCat("a", [paid()], [{ entitlement_id: RC_ENTITLEMENT_ID, expires_at: now + 60000 }], now);
    const receipt = await signVerificationReceipt(state);
    const { payload } = await jwtVerify(receipt, await importJWK(await receiptPublicKey(), "EdDSA"), { currentDate: new Date(now) });
    expect(payload.exp).toBe((now + 60000) / 1000);
  });
});
