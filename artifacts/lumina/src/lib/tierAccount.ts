import { setPremiumCompatibilityMirror } from "./premiumMirror";

export interface TierUser {
  id: string;
  createdAt: string;
  email?: string | null;
  username?: string;
}

let currentUser: TierUser | null = null;
let accountGeneration = 0;
let initialized = false;

export function setCurrentTierUser(user: TierUser | null): void {
  if (!initialized || currentUser?.id !== user?.id) {
    initialized = true;
    accountGeneration++;
    setPremiumCompatibilityMirror(false);
  }
  currentUser = user;
}

export function getTierAccountGeneration(): number { return accountGeneration; }

export function getCurrentTierUser(): TierUser | null {
  return currentUser;
}

export function isCurrentTierUser(accountId: string | null): boolean {
  return Boolean(accountId && currentUser?.id === accountId);
}
