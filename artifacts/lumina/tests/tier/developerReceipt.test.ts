import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@replit/connectors-sdk", () => ({ ReplitConnectors: class {} }));
vi.mock("@/hooks/useAdRewards", () => ({ setPremiumAccountStatus: vi.fn() }));
import { developerSubscription, receiptPublicKey, signVerificationReceipt } from "../../../api-server/src/lib/subscriptions";
import developerIds from "../../../api-server/src/lib/developerIds.json";
import { readSubscription, saveSubscription } from "@/lib/subscriptionCache";
import { setCurrentTierUser } from "@/lib/tierAccount";
import { setPremiumAccountStatus } from "@/hooks/useAdRewards";
import { PREMIUM_COMPATIBILITY_KEY } from "@/lib/premiumMirror";

describe("complimentary signed receipt cache", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "isolated-test-signing-secret");
    localStorage.clear();
    setCurrentTierUser({ id: "a", createdAt: "2020-01-01T00:00:00Z" });
  });
  afterEach(() => { vi.unstubAllEnvs(); setCurrentTierUser(null); });
  it("restores indefinite Premium only within its signed offline window and to its owner", async () => {
    const state = developerSubscription("a", developerIds[0])!;
    const config = { androidApiKey: "goog_test", entitlementIdentifier: "premium",
      managementUrl: "https://play.google.com", receiptPublicKey: await receiptPublicKey() };
    const receipt = await signVerificationReceipt(state);
    saveSubscription({ ...state, receipt, firebaseSync: "synced" });
    expect(setPremiumAccountStatus).toHaveBeenCalledWith("a", true);
    expect(localStorage.getItem(PREMIUM_COMPATIBILITY_KEY)).toBe("premium");
    expect(await readSubscription("a", config)).toMatchObject({ tier: "premium", expiresAt: null });
    localStorage.setItem("lumina_verified_subscription:b", receipt);
    expect(await readSubscription("b", config)).toBeNull();
    const old = { ...state, verifiedAt: Date.now() - 86400001 };
    saveSubscription({ ...old, receipt: await signVerificationReceipt(old), firebaseSync: "synced" });
    expect(await readSubscription("a", config)).toBeNull();
  });
  it("rejects an unsigned local grant", async () => {
    localStorage.setItem("lumina_verified_subscription:a", JSON.stringify({ tier: "premium", expiresAt: null }));
    const config = { androidApiKey: "goog_test", entitlementIdentifier: "premium",
      managementUrl: "https://play.google.com", receiptPublicKey: await receiptPublicKey() };
    expect(await readSubscription("a", config)).toBeNull();
  });
  it("clears the compatibility mirror on switch and sign-out and ignores foreign grants", async () => {
    const state = developerSubscription("a", developerIds[0])!;
    saveSubscription({ ...state, receipt: await signVerificationReceipt(state), firebaseSync: "synced" });
    setCurrentTierUser({ id: "b", createdAt: "2020-01-01T00:00:00Z" });
    expect(localStorage.getItem(PREMIUM_COMPATIBILITY_KEY)).toBe("free");
    saveSubscription({ ...state, receipt: "late-a-receipt", firebaseSync: "synced" });
    expect(localStorage.getItem(PREMIUM_COMPATIBILITY_KEY)).toBe("free");
    setCurrentTierUser({ id: "a", createdAt: "2020-01-01T00:00:00Z" });
    saveSubscription({ ...state, receipt: await signVerificationReceipt(state), firebaseSync: "synced" });
    setCurrentTierUser(null);
    expect(localStorage.getItem(PREMIUM_COMPATIBILITY_KEY)).toBe("free");
  });
});
