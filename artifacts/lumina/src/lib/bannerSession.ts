/** In-memory only: navigation preserves dismissal; a fresh app launch resets it. */
export class BannerSession {
  private dismissedAccounts = new Set<string>();

  isDismissed(accountId: string): boolean {
    return this.dismissedAccounts.has(accountId);
  }

  dismiss(accountId: string): void {
    this.dismissedAccounts.add(accountId);
  }
}

export const bannerSession = new BannerSession();
