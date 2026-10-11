import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { User } from "@workspace/db";
import type { IStorage } from "../storage";
import type { VerifiedFirebaseUser } from "./firebaseAuth";
import { isDeveloperUid } from "./developerAccess";

export type AuthRepository = Pick<IStorage,
  "getUserById" | "getUserByUsername" | "getUserByFirebaseUid" | "linkFirebaseUser" | "createUser">;

export class FirebaseAccountConflictError extends Error {}

export async function resolveFirebaseAccount(identity: VerifiedFirebaseUser, repository: AuthRepository): Promise<User> {
  const linked = await repository.getUserByFirebaseUid(identity.uid);
  if (linked) return linked;
  // Email linking is only allowed after verifyFirebaseIdToken verifies email_verified.
  let user = await repository.getUserByUsername(identity.email);
  if (!user) {
    const password = await bcrypt.hash(randomUUID(), 10);
    try { user = await repository.createUser({ username: identity.email, password }); }
    catch {
      user = await repository.getUserByUsername(identity.email);
      if (!user) throw new Error("Could not provision Firebase account");
    }
  }
  const result = await repository.linkFirebaseUser(user.id, identity.uid);
  if (!result) throw new FirebaseAccountConflictError("Account is already linked to a different Firebase identity");
  return result;
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
