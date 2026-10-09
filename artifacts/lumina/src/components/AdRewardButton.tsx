import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAdRewards } from '@/hooks/useAdRewards';
import { showRewardedAdForAccount } from '@/lib/admob';
import { addBonusQueries } from '@/lib/queryTracker';
import { isCurrentTierUser } from '@/lib/tierAccount';

interface AdRewardButtonProps {
  userId: string;
  disabled?: boolean;
}

export default function AdRewardButton({ userId, disabled = false }: AdRewardButtonProps) {
  const { toast } = useToast();
  const { isPremium, bonusAIQueries } = useAdRewards(userId);
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const native = Capacitor.isNativePlatform();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    };
  }, []);

  const watchAd = async () => {
    if (inFlight.current || disabled || isPremium || !native || !isCurrentTierUser(userId)) return;
    inFlight.current = true;
    setLoading(true);
    setMessage('');
    let rewarded = false;
    try {
      rewarded = await showRewardedAdForAccount(userId);
      if (!isCurrentTierUser(userId)) return;
      if (!rewarded) {
        const description = 'The video was unavailable or not completed. No bonus queries were added.';
        if (mounted.current) setMessage(description);
        toast({ title: 'No reward this time', description });
        return;
      }
      // Award even if the mobile sheet closed during playback, but never to a different account.
      addBonusQueries(2);
      toast({ title: 'You earned +2 bonus queries!', description: 'Your bonus balance has been updated.' });
      if (mounted.current) {
        setMessage('You earned +2 bonus queries!');
        setCelebrating(true);
        if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
        celebrationTimer.current = setTimeout(() => setCelebrating(false), 1600);
      }
    } catch {
      if (!isCurrentTierUser(userId)) return;
      const description = rewarded
        ? 'Your video completed, but device storage could not save the reward. Check storage access before trying again.'
        : 'The ad could not load. Please try again later. No bonus queries were added.';
      if (mounted.current) setMessage(description);
      toast({ title: rewarded ? 'Reward could not be saved' : 'Ad unavailable', description, variant: 'destructive' });
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  if (isPremium) return null;

  return (
    <div className="relative space-y-1.5 rounded-lg border border-primary/15 bg-primary/5 p-2.5" data-testid="ad-rewards-panel">
      <p className="text-[11px] text-muted-foreground" data-testid="bonus-ai-query-balance">
        {bonusAIQueries} bonus AI {bonusAIQueries === 1 ? 'query' : 'queries'} available
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-full min-h-11 gap-2 border-primary/25 bg-background text-xs hover:bg-primary/10"
        onClick={() => void watchAd()}
        disabled={loading || disabled || !native}
        aria-busy={loading}
        data-testid="btn-watch-ad-for-ai-queries"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading ? 'Loading video…' : 'Get Bonus AI Queries 📺'}
      </Button>
      {!native && <p className="text-[10px] text-muted-foreground">Rewarded ads are available in the native Android app.</p>}
      {message && <p className="text-[11px] text-muted-foreground" role="status" data-testid="ad-reward-message">{message}</p>}
      {celebrating && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" data-testid="reward-confetti">
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} className="reward-confetti" style={{
              '--drift': `${(index - 5.5) * 18}px`,
              backgroundColor: ['#a78bfa', '#fbbf24', '#34d399', '#f472b6'][index % 4],
              animationDelay: `${(index % 3) * 70}ms`,
            } as React.CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}
