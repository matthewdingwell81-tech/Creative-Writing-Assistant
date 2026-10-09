import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { PurchaseActions, SubscriptionFeedback, statusCopy } from "@/components/PricingPage";

export default function SettingsPage() {
  const { user } = useAuth();
  const s = useSubscription();
  useEffect(() => {
    const prev = document.title;
    document.title = "Settings | Lumina";
    return () => { document.title = prev; };
  }, []);
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
      </div>
    </main>
  );
}
