export interface TierUser {
  id: string;
  createdAt: string;
}

let currentUser: TierUser | null = null;

export function setCurrentTierUser(user: TierUser | null): void {
  currentUser = user;
}

export function getCurrentTierUser(): TierUser | null {
  return currentUser;
}

export function isCurrentTierUser(accountId: string | null): boolean {
  return Boolean(accountId && currentUser?.id === accountId);
}
