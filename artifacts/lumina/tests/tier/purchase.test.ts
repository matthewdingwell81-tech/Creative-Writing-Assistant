import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  configure: vi.fn(), logIn: vi.fn(), getOfferings: vi.fn(), purchasePackage: vi.fn(), restorePurchases: vi.fn(),
  verify: vi.fn(), config: vi.fn(), save: vi.fn(), record: vi.fn(), receipt: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } }));
vi.mock("@revenuecat/purchases-capacitor", () => ({ Purchases: mock }));
vi.mock("@workspace/api-client-react", () => ({ getBillingConfiguration: mock.config, refreshSubscription: mock.verify }));
vi.mock("@/lib/firebase", () => ({ auth: { authStateReady: async () => {}, currentUser: null } }));
vi.mock("@/lib/subscriptionCache", () => ({ readSubscription: mock.receipt, recordSubscription: mock.record, saveSubscription: mock.save }));
import { setCurrentTierUser } from "@/lib/tierAccount";
import { hasPendingPurchase, manageSubscription, purchasePremium, restorePurchase, retryVerification } from "@/lib/purchase";
const state = (tier = "free") => ({ accountId: "buyer", tier, status: tier === "premium" ? "active" : "none", expiresAt: Date.now() + 86400000 });
describe("native purchase safety", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    setCurrentTierUser({ id: "buyer", createdAt: new Date().toISOString() });
    mock.config.mockResolvedValue({ androidApiKey: "goog_test_public", receiptPublicKey: {} });
    mock.verify.mockResolvedValue(state());
    mock.getOfferings.mockResolvedValue({ current: { monthly: { identifier: "$rc_monthly", product: { priceString: "$4.99" } } } });
    mock.purchasePackage.mockResolvedValue({});
    mock.restorePurchases.mockResolvedValue({});
  });
  it("a successful purchase is granted only after backend verification", async () => {
    mock.verify.mockResolvedValueOnce(state()).mockResolvedValueOnce(state("premium"));
    expect((await purchasePremium()).tier).toBe("premium");
    expect(mock.purchasePackage).toHaveBeenCalledTimes(1);
    expect(mock.verify).toHaveBeenCalledTimes(2);
    expect(hasPendingPurchase("buyer")).toBe(false);
  });
  it("retries a lost confirmation without opening another purchase", async () => {
    mock.verify.mockResolvedValueOnce(state()).mockRejectedValueOnce(new Error("Network failure"));
    await expect(purchasePremium()).rejects.toThrow("Network failure");
    expect(hasPendingPurchase("buyer")).toBe(true);
    mock.verify.mockResolvedValue(state("premium"));
    await retryVerification();
    expect(mock.purchasePackage).toHaveBeenCalledTimes(1);
  });
  it("a pending transaction prevents purchase re-entry after a reload", async () => {
    localStorage.setItem("lumina_purchase_pending:buyer", "true");
    await expect(purchasePremium()).rejects.toThrow("not confirmed");
    expect(mock.purchasePackage).not.toHaveBeenCalled();
  });
  it("already-owned subscriptions never open checkout", async () => {
    mock.verify.mockResolvedValue(state("premium"));
    await purchasePremium();
    expect(mock.purchasePackage).not.toHaveBeenCalled();
  });
  it("an uncertain store error is retained for verification-only retry", async () => {
    mock.purchasePackage.mockRejectedValueOnce(new Error("Network failure"));
    await expect(purchasePremium()).rejects.toThrow("will not start another charge");
    expect(hasPendingPurchase("buyer")).toBe(true);
    await expect(purchasePremium()).rejects.toThrow("not confirmed");
    expect(mock.purchasePackage).toHaveBeenCalledTimes(1);
  });
  it("store cancellation clears pending purchase without granting Premium", async () => {
    mock.purchasePackage.mockRejectedValueOnce({ userCancelled: true });
    await expect(purchasePremium()).rejects.toThrow("cancelled");
    expect(hasPendingPurchase("buyer")).toBe(false);
  });
  it("restore uses the store and backend; it never purchases", async () => {
    mock.verify.mockResolvedValue(state("premium"));
    await restorePurchase();
    expect(mock.restorePurchases).toHaveBeenCalledTimes(1);
    expect(mock.purchasePackage).not.toHaveBeenCalled();
  });
  it("an account change cannot apply a late purchase confirmation", async () => {
    mock.purchasePackage.mockImplementationOnce(async () => {
      setCurrentTierUser({ id: "different-account", createdAt: new Date().toISOString() });
    });
    await expect(purchasePremium()).rejects.toThrow();
    expect(mock.verify).toHaveBeenCalledTimes(1); // No grant for the new account.
    expect(mock.save.mock.calls.every(([value]) => value.tier !== "premium")).toBe(true);
  });
  it("double taps share one purchase operation", async () => {
    mock.verify.mockResolvedValueOnce(state()).mockResolvedValueOnce(state("premium"));
    const a = purchasePremium(); const b = purchasePremium();
    expect(a).toBe(b);
    await a;
    expect(mock.purchasePackage).toHaveBeenCalledTimes(1);
  });
  it("management launches the subscription-specific Google Play page natively", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign }, open: vi.fn() });
    await manageSubscription();
    expect(assign).toHaveBeenCalledWith("https://play.google.com/store/account/subscriptions?sku=lumina_premium&package=com.lumina.app");
  });
});
