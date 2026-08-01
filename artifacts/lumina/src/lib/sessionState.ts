/**
 * One-shot flag that signals the auth page should show the "session expired"
 * banner.  Set it before navigating to /auth; consume it once on mount.
 * Using a module-level variable means it survives the navigate() call but is
 * cleared as soon as AuthPage reads it, so back-navigation never sees it again.
 */

let _sessionExpired = false;

export function setSessionExpired(): void {
  _sessionExpired = true;
}

export function consumeSessionExpired(): boolean {
  const val = _sessionExpired;
  _sessionExpired = false;
  return val;
}
