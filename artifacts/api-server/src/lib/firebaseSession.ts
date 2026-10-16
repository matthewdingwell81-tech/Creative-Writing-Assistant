import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { User } from "@workspace/db";
import type { IStorage } from "../storage";
import type { VerifiedFirebaseUser } from "./firebaseAuth";
import { isDeveloperUid } from "./developerAccess";

export type AuthRepository = Pick<IStorage,
  "getUserById" | "getUserByFirebaseUid" | "resolveFirebaseUser">;

export class FirebaseAccountConflictError extends Error {}

export async function resolveFirebaseAccount(identity: VerifiedFirebaseUser, repository: AuthRepository): Promise<User> {
  const linked = await repository.getUserByFirebaseUid(identity.uid);
  if (linked) return linked;
  // Email linking is only allowed after verifyFirebaseIdToken verifies email_verified.
  const password = await bcrypt.hash(randomUUID(), 10);
  const user = await repository.resolveFirebaseUser(identity.uid, identity.email, password);
  if (!user) throw new FirebaseAccountConflictError("Account is already linked to a different Firebase identity");
  return user;
}

export function authUserData(user: User, identity?: VerifiedFirebaseUser) {
  return {
    id: user.id,
    username: identity?.displayName || user.username,
    email: user.firebaseUid ? identity?.email ?? user.username : null,
    firebaseUid: user.firebaseUid,
    createdAt: user.createdAt.toISOString(),
    // null means paid/free status has not been queried here. Billing remains
    // authoritative for general subscriptions and their signed offline receipts.
    premium: isDeveloperUid(user.firebaseUid) ? true : null,
  };
}
