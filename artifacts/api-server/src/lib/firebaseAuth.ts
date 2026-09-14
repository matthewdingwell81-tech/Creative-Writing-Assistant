import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || "lumina-app-22fd7";

const firebaseKeys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  displayName: string | null;
}

export async function verifyFirebaseIdToken(
  token: string,
): Promise<VerifiedFirebaseUser> {
  const { payload } = await jwtVerify(token, firebaseKeys, {
    algorithms: ["RS256"],
    audience: FIREBASE_PROJECT_ID,
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
  });

  if (
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    typeof payload.email !== "string" ||
    payload.email.length === 0 ||
    payload.email_verified !== true
  ) {
    throw new Error("Firebase token does not contain a verified email");
  }

  return {
    uid: payload.sub,
    email: payload.email,
    displayName: typeof payload.name === "string" ? payload.name : null,
  };
}