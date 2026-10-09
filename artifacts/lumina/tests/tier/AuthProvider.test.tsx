import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, emitAuth, firebase, googleUser, resetFirebase, snapshot } from "./firebaseMock";
import { AuthProvider, useAuth, type UseAuthResult } from "@/hooks/useAuth";
import { getCurrentTierUser } from "@/lib/tierAccount";
import { getUserTier, setUserTier } from "@/lib/userTier";
import { premiumStorageKey } from "@/hooks/useAdRewards";
import SuggestionsSidebar from "@/components/SuggestionsSidebar";

// Coach history and ads are unrelated to tier synchronization. Keep the real
// sidebar, tier service, reward cache, and AuthProvider in the integration.
vi.mock("@/hooks/useCoachHistory", () => ({
  useCoachHistory: () => ({
    messages: [], draft: "", loading: false, syncing: false, storageError: "",
    canEdit: true, deviceHistory: null, setMessages: vi.fn(), setDraft: vi.fn(),
  }),
}));
vi.mock("@/components/AdRewardButton", () => ({ default: () => null }));

const accountA = { id: "server-a", username: "a", email: "a@example.test", createdAt: "2020-01-01T00:00:00Z" };
const accountB = { ...accountA, id: "server-b", username: "b", email: "b@example.test" };
let currentAuth: UseAuthResult;
type Session = Omit<typeof accountA, "email"> & { email: string | null };
let session: Session | null;
let nextLogin: Session;
let fetchMock: ReturnType<typeof vi.fn>;

function Consumer() {
  currentAuth = useAuth();
  return <output data-testid="session">{currentAuth.user?.id ?? "signed-out"}</output>;
}

function Sidebar() {
  const { user } = useAuth();
  return <SuggestionsSidebar
    userId={user?.id ?? null} documentId={1} suggestions={[]} savedSuggestions={[]}
    savedCount={0} changeHistory={[]} loading={false} documentContent="" documentType="novel"
    analysisMode="manual" hasSuggestionUpdate={false} pendingSuggestionCount={0}
    onShowLatestSuggestions={() => {}} onDismiss={() => {}} onSave={() => {}}
    onRemoveSaved={() => {}} onClearHistory={() => {}} onAnalysisModeChange={() => {}}
    onAnalyzeWriting={() => {}} onUpgrade={async () => {}}
  />;
}

async function mount(showSidebar = false) {
  const view = render(<AuthProvider><Consumer />{showSidebar && <Sidebar />}</AuthProvider>);
  await waitFor(() => expect(currentAuth.isLoading).toBe(false));
  return view;
}

beforeEach(() => {
  resetFirebase();
  session = accountA;
  nextLogin = accountB;
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/auth/me") {
      return new Response(JSON.stringify(session), { status: session ? 200 : 401 });
    }
    if (url === "/api/auth/login" || url === "/api/auth/register") {
      return new Response(JSON.stringify(nextLogin), { status: 200 });
    }
    if (url === "/api/auth/firebase-session") return new Response(JSON.stringify(accountA));
    if (url === "/api/auth/logout") return new Response(null, { status: 200 });
    throw new Error(`Unexpected network request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AuthProvider tier lifecycle", () => {
  it("restored Google sessions bind their Firebase UID and clean up on unmount", async () => {
    firebase.auth.currentUser = googleUser();
    const view = await mount();
    expect(screen.getByTestId("session").textContent).toBe(accountA.id);
    expect(getCurrentTierUser()?.id).toBe(accountA.id);
    act(() => emitAuth(googleUser()));
    const listener = firebase.documentListeners[0];
    act(() => listener.next(snapshot({ tier: "premium" })));
    expect(getUserTier()).toBe("premium");
    await act(async () => { await setUserTier("free"); });
    expect(firebase.setDoc.mock.calls[0][0]).toEqual({ path: "users/firebase-a" });
    view.unmount();
    expect(firebase.authListeners.at(-1).stop).toHaveBeenCalledOnce();
    expect(listener.stop).toHaveBeenCalledOnce();
    // Late deliveries after unmount must not change even the old cache.
    listener.next(snapshot({ tier: "premium" }));
    expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBe("free");
  });

  it("Google redirect exchanges its token for a server account before syncing tiers", async () => {
    session = null;
    const user = googleUser();
    firebase.auth.currentUser = user;
    firebase.getRedirectResult.mockResolvedValue({ user });
    await mount();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/firebase-session", {
      method: "POST", credentials: "include", headers: { Authorization: "Bearer mock-id-token" },
    });
    expect(getCurrentTierUser()?.id).toBe(accountA.id);
    act(() => emitAuth(user));
    act(() => firebase.documentListeners[0].next(snapshot({ tier: "premium" })));
    expect(getUserTier()).toBe("premium");
  });

  it("a failed Google session exchange never exposes a Firebase-only premium account", async () => {
    session = null;
    const user = googleUser();
    firebase.auth.currentUser = user;
    firebase.getRedirectResult.mockResolvedValue({ user });
    fetchMock.mockImplementation(async (url: string) => new Response(
      JSON.stringify({ error: "Session exchange rejected" }), { status: url === "/api/auth/me" ? 401 : 403 },
    ));
    await mount();
    expect(currentAuth.user).toBeNull();
    expect(currentAuth.googleError?.message).toBe("Session exchange rejected");
    expect(getCurrentTierUser()).toBeNull();
    expect(firebase.onAuthStateChanged).not.toHaveBeenCalled();
    expect(firebase.onSnapshot).not.toHaveBeenCalled();
    expect(getUserTier()).toBe("free");
  });

  it("switching accounts disposes old listeners, preserves separate caches, and ignores late callbacks", async () => {
    await mount();
    act(() => emitAuth(googleUser()));
    const oldAuth = firebase.authListeners.at(-1);
    const oldDoc = firebase.documentListeners.at(-1);
    act(() => oldDoc.next(snapshot({ tier: "premium" })));
    await act(async () => { await currentAuth.login({ username: "b", password: "mock-password" }); });
    expect(oldAuth.stop).toHaveBeenCalledOnce();
    expect(oldDoc.stop).toHaveBeenCalledOnce();
    expect(getCurrentTierUser()?.id).toBe(accountB.id);
    expect(getUserTier()).toBe("free");
    act(() => emitAuth(googleUser("firebase-b", accountB.email)));
    const newDoc = firebase.documentListeners.at(-1);
    act(() => newDoc.next(snapshot({ tier: "free" })));
    act(() => oldDoc.next(snapshot({ tier: "premium" })));
    expect(getUserTier()).toBe("free");
    expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBe("premium");
    nextLogin = accountA;
    await act(async () => { await currentAuth.login({ username: "a", password: "mock-password" }); });
    expect(newDoc.stop).toHaveBeenCalledOnce();
    expect(getUserTier()).toBe("premium");
    expect(localStorage.getItem(premiumStorageKey(accountB.id))).toBe("free");
  });

  it.each(["logout", "expiry"] as const)("clears tiers and disposes listeners on %s", async reason => {
    await mount();
    act(() => emitAuth(googleUser()));
    const listener = firebase.documentListeners.at(-1);
    const authListener = firebase.authListeners.at(-1);
    act(() => listener.next(snapshot({ tier: "premium" })));
    if (reason === "logout") {
      await act(async () => { await currentAuth.logout(); });
      expect(firebase.signOut).toHaveBeenCalledOnce();
    } else act(() => window.dispatchEvent(new Event("lumina:session-expired")));
    expect(screen.getByTestId("session").textContent).toBe("signed-out");
    expect(getCurrentTierUser()).toBeNull();
    expect(getUserTier()).toBe("free");
    expect(authListener.stop).toHaveBeenCalledOnce();
    expect(listener.stop).toHaveBeenCalledOnce();
    act(() => listener.next(snapshot({ tier: "free" })));
    expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBe("premium");
  });

  it.each(["login", "register"] as const)("keeps username/password %s local with an unrelated Firebase user", async method => {
    session = null;
    firebase.auth.currentUser = googleUser("unrelated-google", "unrelated@example.test");
    nextLogin = { ...accountA, email: null, username: "local-writer" };
    await mount();
    await act(async () => { await currentAuth[method]({ username: "local-writer", password: "mock-password" }); });
    act(() => emitAuth(firebase.auth.currentUser));
    await act(async () => { await setUserTier("premium"); });
    expect(getUserTier()).toBe("premium");
    expect(firebase.onSnapshot).not.toHaveBeenCalled();
    expect(firebase.setDoc).not.toHaveBeenCalled();
    expect(firebase.runTransaction).not.toHaveBeenCalled();
    expect(firebase.doc).not.toHaveBeenCalled();
  });

  it("renders a visible sync warning while retaining cached premium, without leaking it to the next account", async () => {
    localStorage.setItem(premiumStorageKey(accountA.id), "premium");
    await mount(true);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /coach/i }), { button: 0, ctrlKey: false });
    act(() => emitAuth(googleUser()));
    const listener = firebase.documentListeners.at(-1);
    act(() => listener.error(new Error("permission-denied")));
    expect(screen.getByTestId("ai-query-status-message").textContent).toMatch(/Cloud tier sync is unavailable/);
    expect(screen.getByTestId("ai-query-balance").textContent).toBe("Premium · unlimited AI queries");
    expect(getUserTier()).toBe("premium");
    await act(async () => { await currentAuth.login({ username: "b", password: "mock-password" }); });
    expect(screen.queryByTestId("ai-query-status-message")).toBeNull();
    expect(screen.getByTestId("ai-query-balance").textContent).not.toContain("Premium");
    act(() => listener.error(new Error("late error")));
    expect(screen.queryByTestId("ai-query-status-message")).toBeNull();
  });

  it("unmounting during Google token exchange cannot resurrect account state", async () => {
    session = null;
    const user = googleUser();
    firebase.getRedirectResult.mockResolvedValue({ user });
    const token = deferred<string>();
    user.getIdToken.mockReturnValue(token.promise);
    const view = render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(user.getIdToken).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => { token.resolve("mock-id-token"); });
    expect(getCurrentTierUser()).toBeNull();
    expect(firebase.onSnapshot).not.toHaveBeenCalled();
  });
});
