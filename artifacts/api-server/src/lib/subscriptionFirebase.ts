import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { VerifiedSubscription } from "./subscriptions";

function adminApp() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return false;
  const name = "lumina-billing";
  return getApps().find(a => a.name === name) ?? initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
    projectId: "lumina-app-22fd7",
  }, name);
}

export async function getVerifiedFirebaseEmail(uid: string): Promise<string | null> {
  const app = adminApp();
  if (!app) return null;
  const user = await getAuth(app).getUser(uid);
  return user.emailVerified && user.email ? user.email : null;
}

export async function syncSubscriptionToFirebase(
  uid: string,
  subscription: VerifiedSubscription,
  paidSubscription?: VerifiedSubscription,
  manualPremiumAccess = false,
): Promise<boolean> {
  // A browser ID token may link an account, but may NEVER authorize granting
  // Premium. Only the Firebase service account writes entitlements.
  const app = adminApp();
  if (!app) return false;
  const ref = getFirestore(app).doc(`users/${uid}`);
  await getFirestore(app).runTransaction(async transaction => {
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
}
