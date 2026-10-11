/** Compatibility only. Entitlements are account-scoped and server verified. */
export const PREMIUM_COMPATIBILITY_KEY = "lumina.admob.premium";

export function setPremiumCompatibilityMirror(premium: boolean): void {
  try {
    localStorage.setItem(PREMIUM_COMPATIBILITY_KEY, premium ? "premium" : "free");
  } catch {
    // This legacy mirror is optional; it is never an entitlement authority.
  }
}
