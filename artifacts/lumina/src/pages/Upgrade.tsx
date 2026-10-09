import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Crown, Sparkles } from "lucide-react";
import { useAdRewards } from "@/hooks/useAdRewards";
import { useAuth } from "@/hooks/useAuth";

export default function Upgrade() {
  const { user } = useAuth();
  const { isPremium } = useAdRewards(user?.id ?? null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Free & Premium plans | Lumina";
    return () => { document.title = previousTitle; };
  }, []);

  const plans = [
    {
      name: "Free",
      icon: Sparkles,
      description: "Keep writing, with AI help every day.",
      features: [
        "Unlimited AI Coach for your first seven days",
        "Five AI Coach queries per local calendar day after your trial",
        "Two bonus queries per completed rewarded ad in the Android app",
        "Unused bonus queries carry over to future days",
        "Your writing workspace, documents, and story planning",
      ],
    },
    {
      name: "Premium",
      icon: Crown,
      description: "Unlimited AI support, without ads.",
      features: [
        "Unlimited AI Coach queries",
        "No daily query limit",
        "No banner or rewarded ads",
        "Web portal access",
        "All Free writing and planning features",
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-8 sm:px-8" data-testid="upgrade-page">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-to-writing">
          <ArrowLeft className="h-4 w-4" /> Back to writing
        </Link>
        <header className="mt-8 mb-8">
          <p className="text-sm font-medium text-primary">Lumina plans</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">AI help that fits your writing</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">Start with seven days of unlimited AI, then keep five free Coach queries each day. Premium is on its way.</p>
        </header>
        <div className="grid gap-5 md:grid-cols-2">
          {plans.map((plan) => {
            const premium = plan.name === "Premium";
            const Icon = plan.icon;
            return (
              <section key={plan.name} className={`rounded-xl border p-6 ${premium ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`} data-testid={`plan-${plan.name.toLowerCase()}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-xl font-semibold"><Icon className="h-5 w-5 text-primary" />{plan.name}</h2>
                  {premium ? (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary" data-testid="premium-coming-soon">Coming Soon</span>
                  ) : !isPremium ? (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">Current plan</span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                <ul className="mt-6 space-y-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{feature}</span></li>
                  ))}
                </ul>
                {premium && <p className="mt-6 text-xs text-muted-foreground">Subscriptions are not available yet. No payment is required or collected here.</p>}
              </section>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Only completed, nonempty Coach replies use a query. Failed or cancelled requests don’t count. Daily queries reset at midnight in your device’s local time.</p>
      </div>
    </main>
  );
}
