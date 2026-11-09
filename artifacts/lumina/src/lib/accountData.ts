const ACCOUNT_SCOPED_PREFIXES = [
  "lumina_admob_premium:",
  "lumina_ai_daily_queries:",
  "lumina_admob_bonus_queries:",
  "lumina_verified_subscription:",
  "lumina_purchase_pending:",
  "lumina_tutorial_done:",
  "lumina_first_use:",
  "lumina_coach_history:v1:",
] as const;

export function clearAccountDataFromThisDevice(accountId: string): void {
  if (typeof window === "undefined") return;
  const encodedId = encodeURIComponent(accountId);
  try {
    const localKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of localKeys) {
      if (key && ACCOUNT_SCOPED_PREFIXES.some(prefix =>
        prefix === "lumina_coach_history:v1:"
          ? key.startsWith(`${prefix}${encodedId}:`)
          : key === `${prefix}${encodedId}`,
      )) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Browser storage can be disabled; server-side deletion remains authoritative.
  }
  try {
    const billingConfiguration = localStorage.getItem("lumina_billing_configuration");
    if (billingConfiguration && JSON.parse(billingConfiguration)?.accountId === accountId) {
      localStorage.removeItem("lumina_billing_configuration");
    }
  } catch {
    // A malformed optional cache does not affect server-side deletion.
  }
  try {
    localStorage.setItem("lumina.admob.premium", "free");
  } catch {
    // The compatibility mirror is optional.
  }

  try {
    sessionStorage.removeItem(`lumina_plans_document:${encodedId}`);
  } catch {
    // Session storage is also optional.
  }
}
