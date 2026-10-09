import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, emitAuth, firebase, flushTransactions, googleUser, resetFirebase, snapshot } from "./firebaseMock";
import { getUserTier, isFirebaseLoggedIn, isPremium, setUserTier, syncUserTier, TIER_SYNC_ERROR_EVENT } from "@/lib/userTier";
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
  disposers.forEach(stop => stop());
  disposers = [];
  syncUserTier(null);
  setCurrentTierUser(null);
});

describe("Firebase tier documents", () => {
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

  it("persists a merge to the matching Firebase UID and grants only after acknowledgement", async () => {
    const listener = bind();
    const write = deferred();
    firebase.setDoc.mockReturnValue(write.promise);
    const result = setUserTier("premium");
    await flushTransactions();
    expect(firebase.setDoc).toHaveBeenCalledWith(
      { path: "users/firebase-a" }, { tier: "premium", updatedAt: "mock-server-timestamp" }, { merge: true },
    );
    listener.next(snapshot({ tier: "premium" }, { hasPendingWrites: true, fromCache: true }));
    expect(getUserTier()).toBe("free");
    expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBeNull();
    write.resolve();
    await result;
    expect(getUserTier()).toBe("premium");
    await setUserTier("free");
    expect(getUserTier()).toBe("free");
  });

  it("keeps the last confirmed tier when an offline/denied write rejects", async () => {
    const listener = bind();
    listener.next(snapshot({ tier: "premium" }));
    firebase.setDoc.mockRejectedValue(new Error("offline"));
    await expect(setUserTier("free")).rejects.toThrow("offline");
    expect(getUserTier()).toBe("premium");
    listener.next(snapshot({ tier: "free" }, { hasPendingWrites: true }));
    expect(getUserTier()).toBe("premium");
  });

  it.each([undefined, { displayName: "Profile without tier" }])(
    "initializes a missing tier transactionally without replacing profile fields (%j)",
    async profile => {
      const listener = bind();
      firebase.transactionGet.mockResolvedValue(snapshot(profile));
      listener.next(snapshot(profile));
      await flushTransactions();
      expect(firebase.transactionGet).toHaveBeenCalledWith(listener.ref);
      expect(firebase.transactionSet).toHaveBeenCalledWith(
        listener.ref, { tier: "free", updatedAt: "mock-server-timestamp" }, { merge: true },
      );
      expect(firebase.setDoc).not.toHaveBeenCalled();
      expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBeNull();
      listener.next(snapshot({ tier: "free" }));
      expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBe("free");
    },
  );

  it("does not overwrite a purchase committed between the snapshot and transaction", async () => {
    const listener = bind();
    firebase.transactionGet.mockResolvedValue(snapshot({ tier: "premium", displayName: "Purchased" }));
    listener.next(snapshot({ displayName: "Existing" }));
    await flushTransactions();
    expect(firebase.runTransaction).toHaveBeenCalledOnce();
    expect(firebase.transactionSet).not.toHaveBeenCalled();
    listener.next(snapshot({ tier: "premium" }));
    expect(getUserTier()).toBe("premium");
  });

  it("does not provision from cache or pending writes and suppresses duplicate provisioning", async () => {
    const listener = bind();
    listener.next(snapshot(undefined, { fromCache: true }));
    listener.next(snapshot({}, { hasPendingWrites: true }));
    expect(firebase.runTransaction).not.toHaveBeenCalled();
    const read = deferred<ReturnType<typeof snapshot>>();
    firebase.transactionGet.mockReturnValue(read.promise);
    listener.next(snapshot({}));
    listener.next(snapshot({}));
    expect(firebase.runTransaction).toHaveBeenCalledOnce();
    read.resolve(snapshot({ tier: "premium" }));
    await flushTransactions();
    expect(firebase.transactionSet).not.toHaveBeenCalled();
  });

  it("preserves cached tiers and reports account-scoped listener/auth/provisioning errors", async () => {
    localStorage.setItem(premiumStorageKey(accountA.id), "premium");
    const onError = vi.fn();
    window.addEventListener(TIER_SYNC_ERROR_EVENT, onError);
    try {
      const listener = bind();
      listener.error(new Error("unavailable"));
      firebase.authListeners[0].error(new Error("auth unavailable"));
      firebase.runTransaction.mockRejectedValue(new Error("permission-denied"));
      listener.next(snapshot({}));
      await flushTransactions();
      expect(getUserTier()).toBe("premium");
      expect(onError).toHaveBeenCalledTimes(3);
      expect(onError.mock.calls[0][0].detail).toEqual({
        accountId: accountA.id,
        message: "Cloud tier sync is unavailable. Your saved device tier is still in use.",
      });
      // A failed transaction can be retried, rather than leaving provisioning stuck.
      listener.next(snapshot({}));
      await flushTransactions();
      expect(firebase.runTransaction).toHaveBeenCalledTimes(2);
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

describe("account boundaries and in-flight work", () => {
  it("server-only username/password accounts stay local even with an unrelated Firebase login", async () => {
    const localAccount = { ...accountA, email: null, username: "local-writer" };
    setCurrentTierUser(localAccount);
    disposers.push(syncUserTier(localAccount));
    emitAuth(googleUser("unrelated-uid"));
    await setUserTier("premium");
    expect(getUserTier()).toBe("premium");
    expect(firebase.doc).not.toHaveBeenCalled();
    expect(firebase.onSnapshot).not.toHaveBeenCalled();
    expect(firebase.setDoc).not.toHaveBeenCalled();
    expect(firebase.runTransaction).not.toHaveBeenCalled();
  });

  it("local accounts work without Firebase and reject anonymous/invalid changes", async () => {
    bind(accountA, null);
    expect(await isFirebaseLoggedIn()).toBe(false);
    await setUserTier("premium");
    expect(getUserTier()).toBe("premium");
    expect(firebase.setDoc).not.toHaveBeenCalled();
    await expect(setUserTier("enterprise" as any)).rejects.toThrow("Invalid user tier");
    setCurrentTierUser(null);
    await expect(setUserTier("premium")).rejects.toThrow("signed-in account");
    expect(getUserTier()).toBe("free");
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

  it("a transaction queued for an old identity cannot initialize its tier after detachment", async () => {
    const old = bind();
    const read = deferred<ReturnType<typeof snapshot>>();
    firebase.transactionGet.mockReturnValue(read.promise);
    old.next(snapshot({ displayName: "Existing profile" }));
    emitAuth(null);
    read.resolve(snapshot({ displayName: "Existing profile" }));
    await flushTransactions();
    expect(old.stop).toHaveBeenCalledOnce();
    expect(firebase.transactionSet).not.toHaveBeenCalled();
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

  it("an account switch while auth readiness is pending must not write the previous user's document", async () => {
    bind();
    const ready = deferred();
    firebase.auth.authStateReady.mockReturnValue(ready.promise);
    const result = setUserTier("premium");
    setCurrentTierUser(accountB);
    ready.resolve();
    await expect(result).rejects.toThrow("account changed");
    expect(firebase.setDoc).not.toHaveBeenCalled();
    expect(getUserTier()).toBe("free");
  });

  it("a write already in flight may finish but cannot grant a tier to the next account", async () => {
    bind();
    const write = deferred();
    firebase.setDoc.mockReturnValue(write.promise);
    const result = setUserTier("premium");
    await flushTransactions();
    setCurrentTierUser(accountB);
    write.resolve();
    await expect(result).rejects.toThrow("account changed");
    expect(getUserTier()).toBe("free");
    expect(localStorage.getItem(premiumStorageKey(accountA.id))).toBeNull();
    expect(localStorage.getItem(premiumStorageKey(accountB.id))).toBeNull();
  });

  it("an acknowledged write cannot grant a tier after the Firebase identity changes", async () => {
    bind();
    const write = deferred();
    firebase.setDoc.mockReturnValue(write.promise);
    const result = setUserTier("premium");
    await flushTransactions();
    emitAuth(null);
    write.resolve();
    await expect(result).rejects.toThrow("account changed");
    expect(getUserTier()).toBe("free");
  });
});
