import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { VerifiedSubscription } from "./subscriptions";

function adminApp() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  const name = "lumina-billing";
  return getApps().find(a => a.name === name) ?? initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
    projectId: "lumina-app-22fd7",
  }, name);
}

export async function deleteFirebaseIdentity(uid: string): Promise<void> {
  const app = adminApp();
  if (!app) throw new Error("Firebase account deletion is not configured");
  await getFirestore(app).doc(`users/${uid}`).delete();
  try {
    await getAuth(app).deleteUser(uid);
  } catch (error) {
    if (error && typeof error === "object" &&
        "code" in error && error.code === "auth/user-not-found") return;
    throw error;
  }
}

export async function getVerifiedFirebaseEmail(uid: string): Promise<string | null> {
  const app = adminApp();
  if (!app) return null;
  const user = await getAuth(app).getUser(uid);
  return user.emailVerified && user.email ? user.email : null;
}

export function createSubscriptionFirebaseSync(getDatabase: () => Firestore | null) {
  return async function syncSubscriptionToFirebase(
    uid: string,
    subscription: VerifiedSubscription,
    paidSubscription?: VerifiedSubscription,
    manualPremiumAccess = false,
  ): Promise<boolean> {
    // A browser ID token may link an account, but may NEVER authorize granting
    // Premium. Only the Firebase service account writes entitlements.
    const database = getDatabase();
    if (!database) return false;
    const ref = database.doc(`users/${uid}`);
    await database.runTransaction(async transaction => {
      const previous = await transaction.get(ref);
      // A delayed verification/event must not overwrite a newer subscription.
      if ((previous.data()?.subscriptionVerifiedAt ?? 0) > subscription.verifiedAt) return;
      transaction.set(ref, {
        tier: subscription.tier,
        manualPremiumAccess,
        subscriptionVerifiedAt: subscription.verifiedAt,
        ...(paidSubscription ? {
          subscriptionId: paidSubscription.subscriptionId,
          expiresAt: paidSubscription.expiresAt,
          subscriptionStatus: paidSubscription.status,
        } : {}),
      }, { merge: true });
    });
    return true;
  };
}

export const syncSubscriptionToFirebase = createSubscriptionFirebaseSync(() => {
  const app = adminApp();
  return app ? getFirestore(app) : null;
});
