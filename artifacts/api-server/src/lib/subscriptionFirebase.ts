import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { VerifiedSubscription } from "./subscriptions";

export async function syncSubscriptionToFirebase(uid: string, subscription: VerifiedSubscription): Promise<boolean> {
  // A browser ID token may link an account, but may NEVER authorize granting
  // Premium. Only the Firebase service account writes paid entitlements.
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return false;
  const name = "lumina-billing";
  const app = getApps().find(a => a.name === name) ?? initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
    projectId: "lumina-app-22fd7",
  }, name);
  const ref = getFirestore(app).doc(`users/${uid}`);
  await getFirestore(app).runTransaction(async transaction => {
    const previous = await transaction.get(ref);
    // A delayed verification/event must not overwrite a newer subscription.
    if ((previous.data()?.subscriptionVerifiedAt ?? 0) > subscription.verifiedAt) return;
    transaction.set(ref, {
      tier: subscription.tier,
      subscriptionId: subscription.subscriptionId,
      expiresAt: subscription.expiresAt,
      subscriptionStatus: subscription.status,
      subscriptionVerifiedAt: subscription.verifiedAt,
    }, { merge: true });
  });
  return true;
}
