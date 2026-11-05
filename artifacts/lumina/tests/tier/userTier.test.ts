import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitAuth, firebase, googleUser, resetFirebase, snapshot } from "./firebaseMock";
import { DEVELOPER_IDS, getUserTier, isFirebaseLoggedIn, isPremium, syncUserTier, TIER_SYNC_ERROR_EVENT } from "@/lib/userTier";
import { recordSubscription, forgetSubscription } from "@/lib/subscriptionCache";
import { setCurrentTierUser } from "@/lib/tierAccount";
import { premiumStorageKey } from "@/hooks/useAdRewards";

const accountA = { id: "server-a", username: "a", email: "a@example.test", createdAt: "2020-01-01T00:00:00Z" };
const accountB = { ...accountA, id: "server-b", username: "b", email: "b@example.test" };
let disposers: (() => void)[] = [];

function bind(account = accountA, user: ReturnType<typeof googleUser> | null = googleUser()) {
  setCurrentTierUser(account);
  disposers.push(syncUserTier(account));
  emitAuth(user);
  return firebase.documentListeners.at(-1);
}

beforeEach(() => { resetFirebase(); setCurrentTierUser(null); });
afterEach(() => {
  forgetSubscription(accountA.id);
  forgetSubscription(accountB.id);
  disposers.forEach(stop => stop());
  disposers = [];
  syncUserTier(null);
  setCurrentTierUser(null);
});

describe("Firebase tier documents", () => {
  it("requires a server grant before the allowlisted Firebase identity gets Premium", () => {
    bind(accountA, googleUser(DEVELOPER_IDS[0], accountA.email));
    expect(isPremium()).toBe(false);
    recordSubscription({
      accountId: accountA.id, tier: "premium", status: "active", expiresAt: null,
      subscriptionId: null, verifiedAt: Date.now(), receipt: "server-receipt", firebaseSync: "synced",
    });
    expect(isPremium()).toBe(true);
    expect(getUserTier()).toBe("premium");
    setCurrentTierUser(accountB);
    expect(isPremium()).toBe(false);
  });
  it("expires a complimentary server grant after the offline window", () => {
    bind(accountA, googleUser(DEVELOPER_IDS[0], accountA.email));
    recordSubscription({
      accountId: accountA.id, tier: "premium", status: "active", expiresAt: null,
      subscriptionId: null, verifiedAt: Date.now() - 86400001, receipt: "server-receipt", firebaseSync: "synced",
    });
    expect(isPremium()).toBe(false);
    expect(getUserTier()).toBe("free");
  });
  it("reads users/{Firebase UID}, never the server ID, and follows confirmed upgrades/downgrades", async () => {
    const listener = bind(accountA, googleUser("google-uid", "A@EXAMPLE.TEST"));
    expect(listener.ref).toEqual({ path: "users/google-uid" });
    expect(listener.options).toEqual({ includeMetadataChanges: true });
    listener.next(snapshot({ tier: "premium", name: "Existing profile" }));
    expect(getUserTier()).toBe("premium");
    expect(isPremium()).toBe(true);
    expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBe("premium");
    listener.next(snapshot({ tier: "free" }));
    expect(getUserTier()).toBe("free");
    expect(await isFirebaseLoggedIn()).toBe(true);
  });

  it.each([undefined, { displayName: "Profile without tier" }])(
    "does not write a missing or incomplete server-owned user document (%j)",
    profile => {
      const listener = bind();
      listener.next(snapshot(profile));
      expect(firebase.setDoc).not.toHaveBeenCalled();
      expect(firebase.runTransaction).not.toHaveBeenCalled();
      expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBeNull();
    },
  );

  it("never provisions a client write from cached or pending snapshots", () => {
    const listener = bind();
    listener.next(snapshot(undefined, { fromCache: true }));
    listener.next(snapshot({}, { hasPendingWrites: true }));
    listener.next(snapshot({}));
    expect(firebase.setDoc).not.toHaveBeenCalled();
    expect(firebase.runTransaction).not.toHaveBeenCalled();
    expect(firebase.transactionSet).not.toHaveBeenCalled();
    expect(getUserTier()).toBe("free");
  });

  it("preserves cached tiers and reports account-scoped listener/auth errors", async () => {
    localStorage.setItem(premiumStorageKey(accountA.id), "premium");
    const onError = vi.fn();
    window.addEventListener(TIER_SYNC_ERROR_EVENT, onError);
    try {
      const listener = bind();
      listener.error(new Error("unavailable"));
      firebase.authListeners[0].error(new Error("auth unavailable"));
      expect(getUserTier()).toBe("premium");
      expect(onError).toHaveBeenCalledTimes(2);
      expect(onError.mock.calls[0][0].detail).toEqual({
        accountId: accountA.id,
        message: "Cloud tier sync is unavailable. Your saved device tier is still in use.",
      });
      expect(firebase.runTransaction).not.toHaveBeenCalled();
    } finally { window.removeEventListener(TIER_SYNC_ERROR_EVENT, onError); }
  });

  it("invalid cloud tiers warn without changing the cache", () => {
    const listener = bind();
    const onError = vi.fn();
    window.addEventListener(TIER_SYNC_ERROR_EVENT, onError);
    try {
      listener.next(snapshot({ tier: "enterprise" }));
      expect(getUserTier()).toBe("free");
      expect(onError).toHaveBeenCalledOnce();
      expect(firebase.runTransaction).not.toHaveBeenCalled();
    } finally { window.removeEventListener(TIER_SYNC_ERROR_EVENT, onError); }
  });
});

describe("account boundaries and stale Firestore events", () => {
  it("server-only username/password accounts do not attach an unrelated Firebase document", () => {
    const localAccount = { ...accountA, email: null, username: "local-writer" };
    setCurrentTierUser(localAccount);
    disposers.push(syncUserTier(localAccount));
    emitAuth(googleUser("unrelated-uid"));
    expect(getUserTier()).toBe("free");
    expect(firebase.doc).not.toHaveBeenCalled();
    expect(firebase.onSnapshot).not.toHaveBeenCalled();
    expect(firebase.setDoc).not.toHaveBeenCalled();
    expect(firebase.runTransaction).not.toHaveBeenCalled();
  });

  it("local accounts work without Firebase and default to Free", async () => {
    bind(accountA, null);
    expect(await isFirebaseLoggedIn()).toBe(false);
    expect(getUserTier()).toBe("free");
    expect(firebase.setDoc).not.toHaveBeenCalled();
  });

  it("disposed listeners cannot mutate caches, emit warnings, or attach another listener", () => {
    const listener = bind();
    const authListener = firebase.authListeners[0];
    disposers[0]();
    setCurrentTierUser(null);
    const onError = vi.fn();
    window.addEventListener(TIER_SYNC_ERROR_EVENT, onError);
    try {
      listener.next(snapshot({ tier: "premium" }));
      listener.error(new Error("late"));
      authListener.next(googleUser());
      authListener.error(new Error("late"));
      expect(authListener.stop).toHaveBeenCalledOnce();
      expect(listener.stop).toHaveBeenCalledOnce();
      expect(firebase.onSnapshot).toHaveBeenCalledOnce();
      expect(onError).not.toHaveBeenCalled();
      expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBeNull();
    } finally { window.removeEventListener(TIER_SYNC_ERROR_EVENT, onError); }
  });

  it("switching Firebase identity invalidates the old document even if its UID later returns", () => {
    const old = bind();
    emitAuth(googleUser("different-uid", "unrelated@example.test"));
    expect(old.stop).toHaveBeenCalledOnce();
    emitAuth(googleUser());
    const current = firebase.documentListeners.at(-1);
    current.next(snapshot({ tier: "free" }));
    old.next(snapshot({ tier: "premium" }));
    expect(getUserTier()).toBe("free");
  });

  it("late errors from a detached document do not warn for a new Firebase identity", () => {
    const old = bind();
    emitAuth(googleUser("other-uid"));
    const onError = vi.fn();
    window.addEventListener(TIER_SYNC_ERROR_EVENT, onError);
    try {
      old.error(new Error("late error"));
      expect(onError).not.toHaveBeenCalled();
      firebase.documentListeners.at(-1).error(new Error("current error"));
      expect(onError).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(TIER_SYNC_ERROR_EVENT, onError); }
  });

});
