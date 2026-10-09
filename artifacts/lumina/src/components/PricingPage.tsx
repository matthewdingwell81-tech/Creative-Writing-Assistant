import { useEffect } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, Check, Crown, Sparkles, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";

export const MARKETING_PRICE = "$4.99/month";

export function formatDate(ts: number | null | undefined) {
  return ts ? new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;
}

/** Shared status, error, offline, sync and native-availability feedback. */
export function SubscriptionFeedback({ testIdPrefix = "subscription" }: { testIdPrefix?: string }) {
  const s = useSubscription();
  const { subscription } = s;
  return (
    <div className="space-y-3">
      {!s.nativeAvailable && (
        <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm" data-testid={`${testIdPrefix}-native-note`}>
          Purchases and restores can’t run in a web browser. Open Lumina on Android to subscribe or restore a purchase.
        </p>
      )}
      {s.offline && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm" data-testid={`${testIdPrefix}-offline`}>
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />You’re offline. Showing your last verified subscription status.
        </p>
      )}
      {subscription?.firebaseSync === "unavailable" && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid={`${testIdPrefix}-sync-warning`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          Cloud sync is unavailable right now, so Premium may not appear on your other devices until it reconnects.
        </p>
      )}
      {s.pendingVerification && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm" data-testid={`${testIdPrefix}-pending`}>
          Your purchase is waiting for verification. Retry verification below; you won’t be charged again.
        </p>
      )}
      {s.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid={`${testIdPrefix}-error`}>
          <span>{s.error}</span>
          <Button size="sm" variant="outline" className="min-h-11" disabled={s.busy} data-testid={`${testIdPrefix}-retry`}
            onClick={() => void (s.pendingVerification ? s.retry() : s.refresh())}>
            {s.pendingVerification ? "Retry verification" : "Retry"}
          </Button>
        </div>
      )}
      {!s.error && s.pendingVerification && (
        <Button size="sm" variant="outline" className="min-h-11" disabled={s.busy} onClick={() => void s.retry()} data-testid={`${testIdPrefix}-retry`}>Retry verification</Button>
      )}
      {s.message && <p role="status" className="text-sm text-muted-foreground" data-testid={`${testIdPrefix}-message`}>{s.message}</p>}
    </div>
  );
}

/** Explains status including cancelled/expired copy. */
export function statusCopy(sub: ReturnType<typeof useSubscription>["subscription"], isPremium: boolean) {
  const date = formatDate(sub?.expiresAt);
  if (isPremium && sub?.status === "cancelled") return `Your subscription is cancelled. You keep Premium access until ${date ?? "the end of your billing period"}.`;
  if (isPremium) return date ? `Premium is active. Current period ends ${date}.` : "Premium is active.";
  if (sub?.status === "expired") return `Your Premium subscription expired${date ? ` on ${date}` : ""}. You’re back on the Free plan with five AI queries a day.`;
  if (sub?.status === "cancelled") return "Your subscription was cancelled and access has ended. You’re on the Free plan.";
  return "You’re on the Free plan.";
}

export function PurchaseActions({ upgradeLabel = "Upgrade", testIdPrefix = "pricing" }: { upgradeLabel?: string; testIdPrefix?: string }) {
  const s = useSubscription();
  const blocked = s.busy || s.loading || !s.nativeAvailable;
  return (
    <div className="mt-6 flex flex-col gap-2 sm:flex-row">
      {s.isPremium ? (
        <Button className="min-h-11" disabled={s.busy} onClick={() => void s.manage()} data-testid={`${testIdPrefix}-manage`}>Manage Subscription</Button>
      ) : (
        <Button className="min-h-11" disabled={blocked} onClick={() => void s.purchase()} data-testid={`${testIdPrefix}-upgrade`}>
          {s.busy ? "Working..." : upgradeLabel}
        </Button>
      )}
      <Button variant="outline" className="min-h-11" disabled={blocked} onClick={() => void s.restore()} data-testid={`${testIdPrefix}-restore`}>Restore Purchase</Button>
    </div>
  );
}

const free = ["Grammar checking", "Chapter organizer", "Distraction-free editor", "Five AI queries per day"];
const premium = ["Unlimited AI queries", "No ads", "Web portal access", "Priority support", "Everything in Free"];

export default function PricingPage() {
  const s = useSubscription();
  useEffect(() => {
    const prev = document.title;
    document.title = "Free & Premium plans | Lumina";
    return () => { document.title = prev; };
  }, []);
  const priceText = s.price ? `${s.price}/month` : `${MARKETING_PRICE} (target)`;

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-8 text-foreground sm:px-8" data-testid="upgrade-page">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-to-writing">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to writing
        </Link>
        <header className="mb-8 mt-6">
          <p className="text-sm font-medium text-primary">Lumina plans</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">AI help that fits your writing</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">Your first seven days include unlimited AI. After that, Free keeps five Coach queries a day, or go Premium for no limits.</p>
        </header>
        <div className="mb-6"><SubscriptionFeedback /></div>
        {s.loading ? (
          <div className="grid gap-5 md:grid-cols-2" aria-busy="true" data-testid="pricing-loading">
            {[0, 1].map(i => <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-6" data-testid="plan-free">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-xl font-semibold"><Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />Free</h2>
                {!s.isPremium && <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium" data-testid="badge-current-free">Current Plan</span>}
              </div>
              <p className="mt-3 text-2xl font-semibold">Always free</p>
              <ul className="mt-5 space-y-3">
                {free.map(f => <li key={f} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{f}</li>)}
              </ul>
            </section>
            <section className="rounded-xl border border-primary/50 bg-primary/5 p-6" data-testid="plan-premium">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-xl font-semibold"><Crown className="h-5 w-5 text-primary" aria-hidden="true" />Premium</h2>
                {s.isPremium && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary" data-testid="badge-current-premium">Current Plan</span>}
              </div>
              <p className="mt-3 text-2xl font-semibold" data-testid="text-premium-price">{priceText}</p>
              {!s.price && <p className="mt-1 text-xs text-muted-foreground">Target price. Store checkout shows the actual price in your local currency.</p>}
              <ul className="mt-5 space-y-3">
                {premium.map(f => <li key={f} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{f}</li>)}
              </ul>
              <PurchaseActions />
            </section>
          </div>
        )}
        <p className="mt-6 text-sm text-muted-foreground">Each request counts as a query when it is sent, and daily queries reset at midnight in your device’s local time.</p>
      </div>
    </main>
  );
}
