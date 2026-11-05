// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const admin = {
  previous: 0, set: vi.fn(),
};
import { createSubscriptionFirebaseSync } from "../../../api-server/src/lib/subscriptionFirebase";
const syncSubscriptionToFirebase = createSubscriptionFirebaseSync(() => ({
    doc: (path: string) => ({ path }),
    runTransaction: async (update: any) => update({
      get: async () => ({ data: () => ({ subscriptionVerifiedAt: admin.previous }) }),
      set: admin.set,
    }),
  }) as any);
import type { VerifiedSubscription } from "../../../api-server/src/lib/subscriptions";
const effective: VerifiedSubscription = {
  accountId: "account", tier: "premium", status: "active", subscriptionId: null,
  expiresAt: null, verifiedAt: 100,
};
afterEach(() => { vi.unstubAllEnvs(); admin.previous = 0; admin.set.mockClear(); });
describe("server-owned Firestore entitlement mirror", () => {
  it("merges independent manual access and expired paid state into the Firebase UID document", async () => {
    const paid = { ...effective, tier: "free" as const, status: "expired" as const, subscriptionId: "paid", expiresAt: 50 };
    expect(await syncSubscriptionToFirebase("verified-uid", effective, paid, true)).toBe(true);
    expect(admin.set).toHaveBeenCalledWith({ path: "users/verified-uid" }, {
      tier: "premium", manualPremiumAccess: true, subscriptionVerifiedAt: 100,
      subscriptionId: "paid", expiresAt: 50, subscriptionStatus: "expired",
    }, { merge: true });
  });
  it("does not overwrite newer entitlement state with a delayed result", async () => {
    admin.previous = 101;
    await syncSubscriptionToFirebase("verified-uid", effective, effective, false);
    expect(admin.set).not.toHaveBeenCalled();
  });
});
