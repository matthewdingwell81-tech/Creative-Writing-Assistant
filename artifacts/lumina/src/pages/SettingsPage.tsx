import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, BookOpen, Crown, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useTutorial } from "@/hooks/useTutorial";
import { DEVELOPER_IDS } from "@/lib/userTier";
import { usePendingSafetyFlagCount } from "@/hooks/usePendingSafetyFlagCount";
import { useSubscription } from "@/hooks/useSubscription";
import { PurchaseActions, SubscriptionFeedback, statusCopy } from "@/components/PricingPage";

export default function SettingsPage() {
  const { user } = useAuth();
  const {
    tutorialsEnabled, tutorialsReady, tutorialsLoadingError, tutorialsSaveError,
    tutorialsSaving, retryTutorialPreferences, setTutorialsEnabled,
  } = useTutorial();
  const s = useSubscription();
  useEffect(() => {
    const prev = document.title;
    document.title = "Settings | Lumina";
    return () => { document.title = prev; };
  }, []);
  const isDev = !!user?.firebaseUid && DEVELOPER_IDS.includes(user.firebaseUid);
  const pendingFlags = usePendingSafetyFlagCount(user?.id, isDev);
  const blocked = s.busy || s.loading || !s.nativeAvailable;
  const label = s.isPremium ? (s.subscription?.status === "cancelled" ? "Premium (cancelled)" : "Premium (active)")
    : s.subscription?.status === "expired" ? "Free (Premium expired)" : "Free";

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-8 text-foreground sm:px-8" data-testid="settings-page">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-to-writing">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to writing
        </Link>
        <h1 className="mb-6 mt-6 text-3xl font-semibold tracking-tight">Settings</h1>
        <section className="rounded-xl border border-border bg-card p-6" aria-labelledby="sub-heading" data-testid="settings-subscription">
          <h2 id="sub-heading" className="flex items-center gap-2 text-xl font-semibold"><Crown className="h-5 w-5 text-primary" aria-hidden="true" />Subscription</h2>
          {user && <p className="mt-1 text-sm text-muted-foreground" data-testid="text-account">Signed in as {user.email ?? user.username}</p>}
          {s.loading ? (
            <div className="mt-4 h-16 animate-pulse rounded-lg bg-muted" aria-busy="true" data-testid="settings-loading" />
          ) : (
            <div className="mt-4">
              <p className="flex items-center gap-2 font-medium" data-testid="text-plan-status">
                {label}
                <span className="rounded-full bg-muted px-3 py-1 text-xs">Current Plan</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground" data-testid="text-status-detail">{statusCopy(s.subscription, s.isPremium)}</p>
            </div>
          )}
          <div className="mt-4"><SubscriptionFeedback testIdPrefix="settings" /></div>
          {!s.isPremium && !s.loading && (
            <div className="mt-6 rounded-lg border border-border p-4">
              <h3 className="font-medium">Remove Ads</h3>
              <p className="mt-1 text-sm text-muted-foreground">Premium removes banner and rewarded ads and lifts the daily AI limit. Store checkout shows the actual {s.price ? `price (${s.price}/month)` : "price in your local currency"}.</p>
              <Button className="mt-3 min-h-11" disabled={blocked} onClick={() => void s.purchase()} data-testid="settings-remove-ads">Remove Ads</Button>
            </div>
          )}
          <PurchaseActions upgradeLabel="Upgrade to Premium" testIdPrefix="settings" />
        </section>
        <section className="mt-6 rounded-xl border border-border bg-card p-6" aria-labelledby="tutorials-heading" data-testid="settings-tutorials">
          <h2 id="tutorials-heading" className="flex items-center gap-2 text-xl font-semibold">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            Tutorials
          </h2>
          {tutorialsReady ? (
            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <h3 id="tutorial-preferences-label" className="font-medium">Show tutorials and tips</h3>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  This controls tours and contextual tips across your account. Turning them off stays in effect when progress is reset.
                </p>
              </div>
              <Switch
                checked={tutorialsEnabled}
                onCheckedChange={(enabled) => { void setTutorialsEnabled(enabled); }}
                disabled={tutorialsSaving}
                aria-labelledby="tutorial-preferences-label"
                data-testid="tutorial-preferences-switch"
              />
            </div>
          ) : (
            <div className="mt-4" role={tutorialsLoadingError ? "alert" : "status"} aria-live="polite">
              <p className="text-sm text-muted-foreground">
                {tutorialsLoadingError ?? "Loading your saved tutorial setting…"}
              </p>
              {tutorialsLoadingError && (
                <Button
                  className="mt-3 min-h-11"
                  variant="outline"
                  onClick={retryTutorialPreferences}
                  data-testid="button-retry-tutorial-preferences"
                >
                  Retry
                </Button>
              )}
            </div>
          )}
          {tutorialsReady && tutorialsLoadingError && (
            <div className="mt-3 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
              <p className="text-sm text-muted-foreground">Could not refresh this setting from your other devices.</p>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={retryTutorialPreferences}
                data-testid="button-retry-tutorial-preferences"
              >
                Retry
              </Button>
            </div>
          )}
          {tutorialsSaveError && <p className="mt-3 text-sm text-destructive" role="alert" data-testid="tutorial-preferences-save-error">{tutorialsSaveError}</p>}
          {tutorialsReady && !tutorialsSaveError && (
            <p className="mt-3 text-xs text-muted-foreground" data-testid="tutorial-preferences-save-status">
              {tutorialsSaving ? "Saving your preference…" : "Saved to your account."}
            </p>
          )}
        </section>
        <section className="mt-6 rounded-xl border border-border bg-card p-6" aria-labelledby="legal-heading" data-testid="settings-legal">
          <h2 id="legal-heading" className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            Legal
          </h2>
          <nav aria-label="Legal documents" className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/legal#privacy-statement" className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="settings-link-privacy">
              Privacy Statement
            </Link>
            <Link href="/legal#user-agreement" className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="settings-link-agreement">
              User Agreement
            </Link>
          </nav>
        </section>
        {isDev && (
          <section className="mt-6 rounded-xl border border-border bg-card p-6" aria-labelledby="review-heading" data-testid="settings-review">
            <h2 id="review-heading" className="flex items-center gap-2 text-xl font-semibold"><ShieldAlert className="h-5 w-5 text-primary" aria-hidden="true" />Administration</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link href="/admin/review" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary underline-offset-4 hover:underline" data-testid="settings-link-review">
                Safety review
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground" aria-label={`${pendingFlags.data ?? "Pending count unavailable"} pending safety reviews`} data-testid="pending-safety-flag-count">
                  {pendingFlags.data === undefined ? (pendingFlags.isError ? "Unavailable" : "Checking…") : `${pendingFlags.data} pending`}
                </span>
              </Link>
              {pendingFlags.isError && (
                <Button size="sm" variant="outline" className="min-h-11" onClick={() => void pendingFlags.refetch()} disabled={pendingFlags.isFetching} data-testid="button-retry-safety-count">
                  Retry count
                </Button>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
