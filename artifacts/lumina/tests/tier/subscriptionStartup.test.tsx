import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionState } from "@workspace/api-client-react";
const mock = vi.hoisted(() => ({
  user: { id: "developer", email: "developer@example.test", username: "developer", createdAt: "2020-01-01T00:00:00Z" } as {
    id: string; email: string; username: string; createdAt: string;
  } | null,
  firebaseAuth: { currentUser: null as any },
  authListeners: [] as { next: (user: any) => void; stop: ReturnType<typeof vi.fn> }[],
  onAuthStateChanged: vi.fn(),
  verify: vi.fn(), offline: vi.fn(), logout: vi.fn(),
}));
vi.mock("@replit/connectors-sdk", () => ({ ReplitConnectors: class {} }));
vi.mock("@/lib/firebase", () => ({ auth: mock.firebaseAuth }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: mock.onAuthStateChanged }));
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
import { developerSubscription, receiptPublicKey, signVerificationReceipt } from "../../../api-server/src/lib/subscriptions";
import developerIds from "../../../api-server/src/lib/developerIds.json";
import { readSubscription } from "@/lib/subscriptionCache";

async function signedDeveloperSubscription(id: string): Promise<SubscriptionState> {
  const verified = developerSubscription(id, developerIds[0])!;
  return {
    ...verified,
    receipt: await signVerificationReceipt(verified),
    firebaseSync: "synced",
  };
}

async function receiptConfig() {
  return {
    androidApiKey: "goog_test",
    entitlementIdentifier: "premium",
    managementUrl: "https://play.google.com",
    receiptPublicKey: await receiptPublicKey(),
  };
}

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
  vi.stubEnv("SESSION_SECRET", "isolated-test-signing-secret");
  mock.firebaseAuth.currentUser = null;
  mock.authListeners.length = 0;
  mock.onAuthStateChanged.mockImplementation((_auth, next) => {
    const listener = { next, stop: vi.fn() };
    mock.authListeners.push(listener);
    next(mock.firebaseAuth.currentUser);
    return listener.stop;
  });
  mock.user = { id: "developer", email: "developer@example.test", username: "developer", createdAt: "2020-01-01T00:00:00Z" };
  mock.offline.mockResolvedValue(null);
});
afterEach(() => {
  cleanup(); setCurrentTierUser(null);
  forgetSubscription("developer"); forgetSubscription("other");
  vi.unstubAllEnvs();
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
  it("refreshes the server entitlement when the matching Firebase identity signs in later", async () => {
    mock.verify.mockResolvedValueOnce(granted("developer", "free")).mockResolvedValueOnce(granted());
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("account-content").textContent).toBe("free"));
    expect(mock.verify).toHaveBeenCalledTimes(1);

    const firebaseUser = {
      uid: "verified-developer-uid",
      email: "DEVELOPER@example.test",
      emailVerified: true,
    };
    act(() => {
      mock.firebaseAuth.currentUser = firebaseUser;
      mock.authListeners[0].next(firebaseUser);
    });

    await waitFor(() => expect(screen.getByTestId("account-content").textContent).toBe("premium"));
    expect(mock.verify).toHaveBeenCalledTimes(2);
  });
  it("does not refresh or link an unrelated Firebase identity", async () => {
    mock.verify.mockResolvedValue(granted("developer", "free"));
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("account-content").textContent).toBe("free"));

    const unrelatedUser = {
      uid: "unrelated-uid",
      email: "another-account@example.test",
      emailVerified: true,
    };
    act(() => {
      mock.firebaseAuth.currentUser = unrelatedUser;
      mock.authListeners[0].next(unrelatedUser);
    });

    expect(mock.verify).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("account-content").textContent).toBe("free");
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
  it("restores signed Premium after an offline restart, then removes it after an online Free refresh", async () => {
    const config = await receiptConfig();
    const verified = await signedDeveloperSubscription("developer");
    mock.verify.mockResolvedValue(verified);

    const firstLaunch = render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("account-content").textContent).toBe("premium"));
    expect(localStorage.getItem("lumina_verified_subscription:developer")).toBe(verified.receipt);
    firstLaunch.unmount();

    mock.verify.mockRejectedValue(new Error("offline"));
    mock.offline.mockImplementation(async () => readSubscription("developer", config));
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("account-content").textContent).toBe("premium"));
    expect(mounts.every(value => value.tier === "premium" && value.scoped === "premium")).toBe(true);

    mock.verify.mockResolvedValueOnce(granted("developer", "free"));
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(screen.getByTestId("account-content").textContent).toBe("free"));
    expect(localStorage.getItem(premiumStorageKey("developer"))).toBe("free");
  });
  it("does not restore another account's Premium receipt after an offline restart", async () => {
    const config = await receiptConfig();
    const ownerReceipt = await signedDeveloperSubscription("developer");
    localStorage.setItem("lumina_verified_subscription:other", ownerReceipt.receipt);
    mock.user = { ...mock.user!, id: "other" };
    mock.verify.mockRejectedValue(new Error("offline"));
    mock.offline.mockImplementation(async () => readSubscription("other", config));

    render(<Harness />);
    await screen.findByRole("alert");
    expect(screen.queryByTestId("account-content")).toBeNull();
    expect(localStorage.getItem(PREMIUM_COMPATIBILITY_KEY)).toBe("free");
    expect(await readSubscription("other", config)).toBeNull();
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
