import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, firestore } from "./firebase";
import { getCurrentTierUser, isCurrentTierUser } from "./tierAccount";
import { isPremiumAccount, setPremiumAccountStatus } from "@/hooks/useAdRewards";
import { getVerifiedSubscription } from "./subscriptionCache";

export type UserTier = "free" | "premium";
export const TIER_SYNC_ERROR_EVENT = "lumina:tier-sync-error";

interface SessionUser {
  id: string;
  email: string | null;
  username: string;
}

let syncedSession: SessionUser | null = null;

function matchesFirebaseUser(session: SessionUser, user: User | null): user is User {
  const email = session.email ?? session.username;
  return Boolean(user?.email && user.email.toLowerCase() === email.toLowerCase());
}

export async function isFirebaseLoggedIn(): Promise<boolean> {
  await auth.authStateReady();
  return auth.currentUser !== null;
}

export function getUserTier(): UserTier {
  const id = getCurrentTierUser()?.id;
  const verified = id ? getVerifiedSubscription(id) : undefined;
  if (verified) return verified.tier;
  return isPremiumAccount(getCurrentTierUser()?.id) ? "premium" : "free";
}

export function isPremium(): boolean {
  return getUserTier() === "premium";
}

/** Firebase accounts write to their user doc; server-only accounts remain local. */
export async function setUserTier(tier: UserTier): Promise<void> {
  if (tier !== "free" && tier !== "premium") throw new Error("Invalid user tier.");
  const session = syncedSession;
  const accountId = getCurrentTierUser()?.id;
  if (!accountId) throw new Error("A signed-in account is required.");
  await auth.authStateReady();
  if (!isCurrentTierUser(accountId) || syncedSession !== session) {
    throw new Error("The signed-in account changed.");
  }
  if (auth.currentUser && !session) throw new Error("Account tier synchronization is not ready.");
  if (session && session.id === accountId && matchesFirebaseUser(session, auth.currentUser)) {
    const firebaseUid = auth.currentUser.uid;
    await setDoc(doc(firestore, "users", firebaseUid), { tier, updatedAt: serverTimestamp() }, { merge: true });
    if (auth.currentUser?.uid !== firebaseUid) throw new Error("The signed-in account changed.");
  }
  if (!isCurrentTierUser(accountId) || syncedSession !== session) {
    throw new Error("The signed-in account changed.");
  }
  setPremiumAccountStatus(accountId, tier === "premium");
}

// Short aliases for callers that prefer getTier/setTier.
export const getTier = getUserTier;
export const setTier = setUserTier;

/** Keep the account-scoped device cache current; never bind an unrelated Firebase login. */
export function syncUserTier(session: SessionUser | null): () => void {
  syncedSession = session;
  if (!session) return () => {};
  let disposed = false;
  let documentGeneration = 0;
  let stopDocument = () => {};
  const reportError = () => {
    if (disposed || !isCurrentTierUser(session.id)) return;
    window.dispatchEvent(new CustomEvent(TIER_SYNC_ERROR_EVENT, {
      detail: { accountId: session.id, message: "Cloud tier sync is unavailable. Your saved device tier is still in use." },
    }));
  };
  const stopAuth = onAuthStateChanged(auth, firebaseUser => {
    if (disposed) return;
    const generation = ++documentGeneration;
    stopDocument();
    stopDocument = () => {};
    if (!isCurrentTierUser(session.id) || !matchesFirebaseUser(session, firebaseUser)) return;
    const isActiveDocument = () => !disposed && generation === documentGeneration
      && isCurrentTierUser(session.id) && auth.currentUser?.uid === firebaseUser.uid;
    const reportDocumentError = () => { if (isActiveDocument()) reportError(); };
    const userDoc = doc(firestore, "users", firebaseUser.uid);
    let provisioning = false;
    stopDocument = onSnapshot(userDoc, { includeMetadataChanges: true }, snapshot => {
      if (!isActiveDocument()) return;
      // A queued/offline write is not a confirmed cloud entitlement.
      if (snapshot.metadata.hasPendingWrites) return;
      const tier = snapshot.data()?.tier;
      // Paid subscriptions are owned by RevenueCat + backend verification.
      // A delayed Firestore profile snapshot cannot replace a newer purchase.
      if (getVerifiedSubscription(session.id)) return;
      if (tier === "free" || tier === "premium") {
        try {
          const expiresAt = snapshot.data()?.expiresAt;
          setPremiumAccountStatus(session.id, tier === "premium" &&
            (typeof expiresAt !== "number" || expiresAt > Date.now()));
        } catch { reportDocumentError(); }
      } else if (tier === undefined && !snapshot.metadata.fromCache && !provisioning) {
        provisioning = true;
        // Recheck in a transaction so initialization cannot overwrite a new purchase.
        void runTransaction(firestore, async transaction => {
          const latest = await transaction.get(userDoc);
          if (!isActiveDocument()) return;
          if (latest.data()?.tier === undefined) {
            transaction.set(userDoc, { tier: "free", updatedAt: serverTimestamp() }, { merge: true });
          }
        }).catch(reportDocumentError).finally(() => { provisioning = false; });
      } else if (snapshot.exists() && tier !== undefined) {
        reportDocumentError();
      }
    }, reportDocumentError);
  }, reportError);
  return () => {
    if (disposed) return;
    disposed = true;
    stopAuth();
    stopDocument();
    if (syncedSession === session) syncedSession = null;
  };
}
