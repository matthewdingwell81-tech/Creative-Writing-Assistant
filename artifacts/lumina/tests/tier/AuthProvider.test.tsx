import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferred, emitAuth, firebase, googleUser, nativeGoogleSignIn, resetFirebase, snapshot,
} from "./firebaseMock";
import { AuthProvider, getGoogleSignInErrorMessage, useAuth, type UseAuthResult } from "@/hooks/useAuth";
import { getCurrentTierUser } from "@/lib/tierAccount";
import { documentsQueryKey } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { getUserTier } from "@/lib/userTier";
import { premiumStorageKey } from "@/hooks/useAdRewards";
import SuggestionsSidebar from "@/components/SuggestionsSidebar";
import AuthPage from "@/pages/AuthPage";

// Coach history and ads are unrelated to tier synchronization. Keep the real
// sidebar, tier service, reward cache, and AuthProvider in the integration.
vi.mock("@/hooks/useCoachHistory", () => ({
  useCoachHistory: () => ({
    messages: [], draft: "", loading: false, syncing: false, storageError: "",
    canEdit: true, deviceHistory: null, setMessages: vi.fn(), setDraft: vi.fn(),
  }),
}));
vi.mock("@/components/AdRewardButton", () => ({ default: () => null }));
// This suite verifies the cloud tier bridge, not store billing. Paid lifecycle
// verification has its own tests and App supplies the real provider.
vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({
    subscription: null, isPremium: false, loading: false, busy: false,
    nativeAvailable: false, pendingVerification: false, price: null,
    error: null, message: null, offline: false,
    restore: vi.fn(), retry: vi.fn(), refresh: vi.fn(), purchase: vi.fn(), manage: vi.fn(),
  }),
}));

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
  // Loading can settle before React flushes the tier-bridge effect. Wait for
  // its listener before tests deliver a Firebase event.
  if (currentAuth.user) {
    await waitFor(() => expect(firebase.authListeners.length).toBeGreaterThan(0));
  }
  return view;
}

beforeEach(() => {
  queryClient.clear();
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
    act(() => listener.next(snapshot({ tier: "free" })));
    expect(getUserTier()).toBe("free");
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

  it("native Android Google sign-in verifies its Firebase credential with the server", async () => {
    nativeGoogleSignIn.platform = "android";
    session = null;
    const user = googleUser("native-google-uid", accountA.email);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/me") return new Response(null, { status: 401 });
      if (url === "/api/auth/firebase-session") {
        return new Response(JSON.stringify({
          ...accountA, firebaseUid: user.uid, premium: true,
        }), { status: 200 });
      }
      throw new Error(`Unexpected network request: ${url}`);
    });
    firebase.signInWithCredential.mockImplementation(async (_auth, credential) => {
      firebase.auth.currentUser = user;
      return { user, credential };
    });

    await mount();
    await act(async () => { await currentAuth.loginWithGoogle(); });

    expect(nativeGoogleSignIn.initialize).toHaveBeenCalledWith({
      clientId: "test-google-web-client-id",
    });
    expect(nativeGoogleSignIn.isPluginAvailable).toHaveBeenCalledWith("GoogleSignIn");
    expect(nativeGoogleSignIn.signIn).toHaveBeenCalledOnce();
    expect(firebase.googleCredential).toHaveBeenCalledWith("mock-google-provider-id-token");
    expect(firebase.signInWithCredential).toHaveBeenCalledWith(firebase.auth, {
      idToken: "mock-google-provider-id-token",
    });
    expect(firebase.getRedirectResult).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/firebase-session", {
      method: "POST", credentials: "include",
      headers: { Authorization: "Bearer mock-id-token" },
    });
    expect(currentAuth.user).toMatchObject({
      id: accountA.id, firebaseUid: user.uid, premium: true,
    });
  });

  it("reports a missing Android bridge before invoking native auth or creating a server session", async () => {
    nativeGoogleSignIn.platform = "android";
    nativeGoogleSignIn.isPluginAvailable.mockReturnValue(false);
    session = null;
    await mount();

    await act(async () => {
      await expect(currentAuth.loginWithGoogle()).rejects.toThrow("LUMINA_GOOGLE_BRIDGE_MISSING");
    });

    expect(currentAuth.googleError?.message).toContain("updating the website alone cannot add native plugins");
    expect(nativeGoogleSignIn.initialize).not.toHaveBeenCalled();
    expect(nativeGoogleSignIn.signIn).not.toHaveBeenCalled();
    expect(firebase.signInWithCredential).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/auth/firebase-session")).toBe(false);
    expect(currentAuth.user).toBeNull();
  });

  it("distinguishes an incompatible native method from Google credential errors", () => {
    expect(getGoogleSignInErrorMessage({ code: "UNIMPLEMENTED" })).toContain("LUMINA_GOOGLE_BRIDGE_MISMATCH");
  });

  it.each([true, null])("web popup signs in only through the server exchange (premium=%s)", async premium => {
    session = null;
    const token = deferred<string>();
    const googleAccount = googleUser();
    googleAccount.getIdToken.mockReturnValue(token.promise);
    firebase.signInWithPopup.mockResolvedValue({ user: googleAccount });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/me") return new Response(null, { status: 401 });
      if (url === "/api/auth/firebase-session") return new Response(JSON.stringify({
        ...accountA, firebaseUid: googleAccount.uid, premium,
      }));
      throw new Error(`Unexpected network request: ${url}`);
    });
    await mount();
    let signingIn!: Promise<void>;
    act(() => { signingIn = currentAuth.loginWithGoogle(); });
    await waitFor(() => expect(googleAccount.getIdToken).toHaveBeenCalledOnce());
    expect(currentAuth.user).toBeNull();
    await act(async () => { token.resolve("verified-popup-token"); await signingIn; });
    expect(firebase.signInWithPopup).toHaveBeenCalledOnce();
    expect(firebase.googleProvider.setCustomParameters).toHaveBeenCalledWith({ prompt: "select_account" });
    expect(firebase.signInWithRedirect).not.toHaveBeenCalled();
    expect(nativeGoogleSignIn.signIn).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/firebase-session", {
      method: "POST", credentials: "include",
      headers: { Authorization: "Bearer verified-popup-token" },
    });
    expect(currentAuth.user).toMatchObject({ id: accountA.id, premium });
  });

  it("web popup never grants access when the server exchange rejects it", async () => {
    session = null;
    await mount();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Google account rejected" }), { status: 403 }));
    await act(async () => {
      await expect(currentAuth.loginWithGoogle()).rejects.toThrow("Google account rejected");
    });
    expect(currentAuth.user).toBeNull();
    expect(getCurrentTierUser()).toBeNull();
  });

  it("explains blocked web popups without falling back to a redirect", async () => {
    session = null;
    await mount();
    firebase.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    await act(async () => {
      await expect(currentAuth.loginWithGoogle()).rejects.toThrow("auth/popup-blocked");
    });
    expect(currentAuth.user).toBeNull();
    expect(firebase.signInWithRedirect).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/auth/firebase-session")).toBe(false);
  });

  it("disables the sign-in form while Google is pending and recovers after cancellation", async () => {
    session = null;
    const popup = deferred<{ user: ReturnType<typeof googleUser> }>();
    firebase.signInWithPopup.mockReturnValue(popup.promise);
    await mount();
    render(<AuthPage auth={currentAuth} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(screen.getByRole("button", { name: "Signing in with Google..." }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("input-username").hasAttribute("disabled")).toBe(true);

    await act(async () => {
      popup.reject(Object.assign(new Error("Cancelled"), { code: "auth/popup-closed-by-user" }));
    });

    await waitFor(() => expect(screen.getByTestId("text-auth-error").textContent).toContain("cancelled"));
    expect(screen.getByRole("button", { name: "Continue with Google" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByTestId("input-username").hasAttribute("disabled")).toBe(false);
  });

  it("restores native Google authentication without processing a web redirect", async () => {
    nativeGoogleSignIn.platform = "android";
    const user = googleUser("native-google-uid", accountA.email);
    firebase.auth.currentUser = user;
    const apiUser = { ...accountA, firebaseUid: user.uid, premium: true };
    fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(apiUser), {
      status: url === "/api/auth/me" ? 200 : 404,
    }));

    await mount();

    expect(firebase.getRedirectResult).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", {
      credentials: "include",
      headers: {
        Authorization: "Bearer mock-id-token",
        "X-Lumina-Preserve-Password-Session": "true",
      },
    });
    expect(currentAuth.user?.firebaseUid).toBe(user.uid);
    expect(currentAuth.user?.premium).toBe(true);
  });

  it("restores persisted Firebase sign-in via a bearer token without a redirect result", async () => {
    session = { ...accountA };
    const user = googleUser();
    firebase.auth.currentUser = user;
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      ...accountA, firebaseUid: "firebase-a", premium: true,
    })));
    await mount();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", {
      credentials: "include",
      headers: { Authorization: "Bearer mock-id-token", "X-Lumina-Preserve-Password-Session": "true" },
    });
    expect(currentAuth.user?.premium).toBe(true);
    expect(currentAuth.user?.firebaseUid).toBe("firebase-a");
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/auth/firebase-session")).toBe(false);
  });
  it("keeps a valid password session when a persisted Firebase token cannot be read", async () => {
    const user = googleUser();
    user.getIdToken.mockRejectedValue(new Error("Firebase is temporarily unavailable"));
    firebase.auth.currentUser = user;

    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" });
    expect(currentAuth.user?.id).toBe(accountA.id);
    expect(currentAuth.googleError).toBeNull();
  });
  it("keeps a valid password session when Google redirect restoration errors", async () => {
    firebase.getRedirectResult.mockRejectedValue(Object.assign(
      new Error("Firebase is temporarily unavailable"),
      { code: "auth/network-request-failed" },
    ));

    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" });
    expect(currentAuth.user?.id).toBe(accountA.id);
    expect(currentAuth.googleError).toBeNull();
  });
  it("shows the Google redirect error when no server session can be restored", async () => {
    session = null;
    firebase.getRedirectResult.mockRejectedValue(Object.assign(
      new Error("Firebase is temporarily unavailable"),
      { code: "auth/network-request-failed" },
    ));

    await mount();

    expect(currentAuth.user).toBeNull();
    expect(currentAuth.googleError?.message).toMatch(/could not connect/i);
  });
  it("does not let an unrelated unverified Firebase login break password-session restoration", async () => {
    const user = googleUser("unrelated-uid", "unrelated@example.test");
    Object.assign(user, { emailVerified: false });
    firebase.auth.currentUser = user;
    session = { ...accountA, email: null, username: "local-writer" };
    await mount();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" });
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(currentAuth.user?.username).toBe("local-writer");
  });
  it("explains unverified Firebase identity instead of claiming Premium on a missing server session", async () => {
    session = null;
    const user = googleUser();
    Object.assign(user, { emailVerified: false });
    firebase.auth.currentUser = user;
    await mount();
    expect(currentAuth.user).toBeNull();
    expect(currentAuth.googleError?.message).toContain("email is not verified");
  });

  it("a failed Google session exchange never exposes a Firebase-only premium account", async () => {
    session = accountB;
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
      const accountAKey = documentsQueryKey(accountA.id);
      const accountBKey = documentsQueryKey(accountB.id);
      expect(accountAKey).not.toEqual(accountBKey);
      queryClient.setQueryData(accountAKey, [{
        id: 1, title: "Private story title", content: "Private draft text",
      }]);
      queryClient.setQueryData(["/api/documents"], [{
        id: 1, title: "Legacy shared-cache title", content: "Legacy private text",
      }]);
      queryClient.setQueryData(accountBKey, [{ id: 2, title: "Other account", content: "Other private draft" }]);
      expect(queryClient.getQueryData(accountBKey)).toEqual([
        { id: 2, title: "Other account", content: "Other private draft" },
      ]);
      localStorage.setItem("unrelated-browser-data", "keep");
      await act(async () => { await currentAuth.logout(); });
      expect(firebase.signOut).toHaveBeenCalledOnce();
      expect(firebase.auth.currentUser).toBeNull();
      expect(queryClient.getQueryData(accountAKey)).toBeUndefined();
      expect(queryClient.getQueryData(["/api/documents"])).toBeUndefined();
      expect(queryClient.getQueryData(accountBKey)).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST", credentials: "include",
      });
      expect(localStorage.getItem("unrelated-browser-data")).toBe("keep");
    } else act(() => window.dispatchEvent(new Event("lumina:session-expired")));
    expect(screen.getByTestId("session").textContent).toBe("signed-out");
    expect(getCurrentTierUser()).toBeNull();
    expect(getUserTier()).toBe("free");
    expect(authListener.stop).toHaveBeenCalledOnce();
    expect(listener.stop).toHaveBeenCalledOnce();
    act(() => listener.next(snapshot({ tier: "free" })));
    expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBe("premium");
  });

  it("clears the native Google account selection when signing out of Android", async () => {
    nativeGoogleSignIn.platform = "android";
    await mount();

    await act(async () => { await currentAuth.logout(); });

    expect(nativeGoogleSignIn.signOut).toHaveBeenCalledOnce();
    expect(firebase.signOut).toHaveBeenCalledOnce();
    expect(screen.getByTestId("session").textContent).toBe("signed-out");
  });

  it.each(["login", "register"] as const)("keeps username/password %s local with an unrelated Firebase user", async method => {
    session = null;
    firebase.auth.currentUser = googleUser("unrelated-google", "unrelated@example.test");
    nextLogin = { ...accountA, email: null, username: "local-writer" };
    await mount();
    await act(async () => { await currentAuth[method]({ username: "local-writer", password: "mock-password" }); });
    act(() => emitAuth(firebase.auth.currentUser));
    expect(getUserTier()).toBe("free");
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
