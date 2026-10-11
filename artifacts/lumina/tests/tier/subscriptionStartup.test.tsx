import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionState } from "@workspace/api-client-react";
const mock = vi.hoisted(() => ({
  user: { id: "developer", email: "developer@example.test", username: "developer", createdAt: "2020-01-01T00:00:00Z" } as {
    id: string; email: string; username: string; createdAt: string;
  } | null,
  verify: vi.fn(), offline: vi.fn(), logout: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: mock.user, isLoading: false, logout: mock.logout,
}) }));
vi.mock("@/lib/purchase", () => ({
  nativePurchasesAvailable: () => false,
  hasPendingPurchase: () => false,
  verifyPurchase: async (signal?: AbortSignal) => {
    const state = await mock.verify();
    signal?.throwIfAborted();
    recordSubscription(state);
    saveSubscription(state);
    return state;
  },
  loadOfflineSubscription: async () => {
    const state = await mock.offline();
    if (state) { recordSubscription(state); saveSubscription(state); }
    return state;
  },
  getMonthlyPackage: vi.fn(), manageSubscription: vi.fn(), purchasePremium: vi.fn(),
  restorePurchase: vi.fn(), retryVerification: vi.fn(), watchPurchaseUpdates: vi.fn(),
}));
import { SubscriptionProvider, useSubscription } from "@/hooks/useSubscription";
import { recordSubscription, saveSubscription, forgetSubscription } from "@/lib/subscriptionCache";
import { setCurrentTierUser } from "@/lib/tierAccount";
import { premiumStorageKey } from "@/hooks/useAdRewards";
import { PREMIUM_COMPATIBILITY_KEY } from "@/lib/premiumMirror";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const granted = (id = "developer", tier: "free" | "premium" = "premium"): SubscriptionState => ({
  accountId: id, tier, status: tier === "premium" ? "active" : "none",
  expiresAt: null, subscriptionId: null, verifiedAt: Date.now(), receipt: "mock-server-signed-receipt",
  firebaseSync: "synced",
});
const mounts: { tier: string; scoped: string | null; compatibility: string | null }[] = [];
function Content() {
  const { isPremium } = useSubscription();
  const tier = isPremium ? "premium" : "free";
  mounts.push({
    tier, scoped: localStorage.getItem(premiumStorageKey(mock.user!.id)),
    compatibility: localStorage.getItem(PREMIUM_COMPATIBILITY_KEY),
  });
  return <div data-testid="account-content">{tier}</div>;
}
function Harness() {
  setCurrentTierUser(mock.user);
  return <SubscriptionProvider><Content /></SubscriptionProvider>;
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mounts.length = 0;
  mock.user = { id: "developer", email: "developer@example.test", username: "developer", createdAt: "2020-01-01T00:00:00Z" };
  mock.offline.mockResolvedValue(null);
});
afterEach(() => {
  cleanup(); setCurrentTierUser(null);
  forgetSubscription("developer"); forgetSubscription("other");
});
describe("tier initialization before authenticated content", () => {
  it.each(["fresh login", "reload"])("never mounts Free content during developer %s", async () => {
    const pending = deferred<SubscriptionState>();
    mock.verify.mockReturnValue(pending.promise);
    render(<Harness />);
    expect(screen.queryByTestId("account-content")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Preparing your account…");
    expect(mounts).toEqual([]);
    await act(async () => { pending.resolve(granted()); });
    expect(screen.getByTestId("account-content").textContent).toBe("premium");
    expect(mounts.every(value => value.tier === "premium" && value.scoped === "premium" && value.compatibility === "premium")).toBe(true);
  });
  it("mounts confirmed Free accounts normally without reading a global Premium override", async () => {
    mock.user = { ...mock.user!, id: "other" };
    localStorage.setItem(PREMIUM_COMPATIBILITY_KEY, "premium");
    mock.verify.mockResolvedValue(granted("other", "free"));
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("account-content").textContent).toBe("free"));
    expect(localStorage.getItem(PREMIUM_COMPATIBILITY_KEY)).toBe("free");
  });
  it("does not mount content on unverified access, and Retry can recover", async () => {
    mock.verify.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(granted());
    render(<Harness />);
    await screen.findByRole("alert");
    expect(screen.queryByTestId("account-content")).toBeNull();
    expect(localStorage.getItem(PREMIUM_COMPATIBILITY_KEY)).toBe("free");
    fireEvent.click(screen.getByTestId("subscription-startup-retry"));
    await waitFor(() => expect(screen.getByTestId("account-content").textContent).toBe("premium"));
  });
  it("hydrates valid offline Premium before content mounts", async () => {
    mock.verify.mockRejectedValue(new Error("offline"));
    mock.offline.mockResolvedValue(granted());
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("account-content").textContent).toBe("premium"));
    expect(mounts.every(value => value.scoped === "premium" && value.compatibility === "premium")).toBe(true);
  });
  it("hides the old account synchronously when switching and ignores its late response", async () => {
    const old = deferred<SubscriptionState>();
    const next = deferred<SubscriptionState>();
    mock.verify.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const view = render(<Harness />);
    mock.user = { ...mock.user!, id: "other" };
    view.rerender(<Harness />);
    expect(screen.queryByTestId("account-content")).toBeNull();
    await act(async () => { old.resolve(granted()); });
    expect(screen.queryByTestId("account-content")).toBeNull();
    expect(localStorage.getItem(PREMIUM_COMPATIBILITY_KEY)).toBe("free");
    await act(async () => { next.resolve(granted("other", "free")); });
    expect(screen.getByTestId("account-content").textContent).toBe("free");
    expect(localStorage.getItem(premiumStorageKey("other"))).toBe("free");
  });
  it("does not reuse an old in-flight refresh after switching back to the same account", async () => {
    const old = deferred<SubscriptionState>();
    const other = deferred<SubscriptionState>();
    const fresh = deferred<SubscriptionState>();
    mock.verify.mockReturnValueOnce(old.promise).mockReturnValueOnce(other.promise).mockReturnValueOnce(fresh.promise);
    const view = render(<Harness />);
    mock.user = { ...mock.user!, id: "other" }; view.rerender(<Harness />);
    mock.user = { ...mock.user!, id: "developer" }; view.rerender(<Harness />);
    await act(async () => { old.resolve(granted()); });
    expect(screen.queryByTestId("account-content")).toBeNull();
    await act(async () => { fresh.resolve(granted()); });
    expect(screen.getByTestId("account-content").textContent).toBe("premium");
    await act(async () => { other.resolve(granted("other", "free")); });
    expect(screen.getByTestId("account-content").textContent).toBe("premium");
  });
});
