import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTutorial } from '@/hooks/useTutorial';
import type { Placement } from '@/lib/tutorial';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8; // spotlight padding around target
const MAX_RETRIES = 20; // ~1 second total at 50ms each
const RETRY_INTERVAL_MS = 50;
const CARD_WIDTH = 320;

function getTargetEl(target: string): Element | null {
  return document.querySelector(target);
}

function rectFromEl(target: string): Rect | null {
  const el = getTargetEl(target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    top: r.top - PADDING,
    left: r.left - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  };
}

function computeCardStyle(
  rect: Rect,
  placement: Placement,
  cardWidth: number,
  cardHeight: number,
  viewportW: number,
  viewportH: number,
): React.CSSProperties {
  const GAP = 12;
  const MARGIN = 12;
  let top = 0;
  let left = 0;

  switch (placement) {
    case 'bottom':
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - cardWidth / 2;
      break;
    case 'top':
      top = rect.top - cardHeight - GAP;
      left = rect.left + rect.width / 2 - cardWidth / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - cardHeight / 2;
      left = rect.left - cardWidth - GAP;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - cardHeight / 2;
      left = rect.left + rect.width + GAP;
      break;
    case 'center':
    default:
      top = viewportH / 2 - cardHeight / 2;
      left = viewportW / 2 - cardWidth / 2;
      break;
  }

  left = Math.max(MARGIN, Math.min(left, viewportW - cardWidth - MARGIN));
  top = Math.max(MARGIN, Math.min(top, viewportH - cardHeight - MARGIN));

  if (placement === 'bottom' && top + cardHeight > viewportH - MARGIN) {
    top = Math.max(MARGIN, rect.top - cardHeight - GAP);
  }
  if (placement === 'top' && top < MARGIN) {
    top = rect.top + rect.height + GAP;
  }

  return { position: 'fixed', top, left, width: cardWidth };
}

export default function TutorialOverlay() {
  const { currentStep, stepIndex, steps, next, prev, dismiss, complete, skipCurrentStep, triggerSideEffect } = useTutorial();
  const [spotlightRect, setSpotlightRect] = useState<Rect | null>(null);
  /** True while we are still searching for the target element (before rect is known) */
  const [locating, setLocating] = useState(false);
  const [cardHeight, setCardHeight] = useState(160);
  const cardRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const currentStepIdRef = useRef<string | null>(null);

  const clearRetry = () => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  };

  const attemptLocate = useCallback((stepId: string, target: string, skipIfMissing: boolean) => {
    if (currentStepIdRef.current !== stepId) return; // stale

    const rect = rectFromEl(target);
    if (rect) {
      setSpotlightRect(rect);
      setLocating(false);
      retryCountRef.current = 0;
      return;
    }

    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current += 1;
      retryRef.current = setTimeout(() => attemptLocate(stepId, target, skipIfMissing), RETRY_INTERVAL_MS);
    } else {
      // Target never appeared
      retryCountRef.current = 0;
      setLocating(false);
      if (skipIfMissing) {
        // Auto-advance to skip this step
        skipCurrentStep();
      }
      // else: fall through — show centred card with full backdrop
    }
  }, [skipCurrentStep]);

  // When step changes: fire side effect, reset spotlight, start locating target
  useEffect(() => {
    clearRetry();
    retryCountRef.current = 0;

    if (!currentStep) {
      currentStepIdRef.current = null;
      setSpotlightRect(null);
      return;
    }

    currentStepIdRef.current = currentStep.id;
    setSpotlightRect(null);
    setLocating(true); // don't block interactions while searching for the target

    // Fire side effect first (e.g. open assistant sheet), then locate
    if (currentStep.sideEffect) {
      triggerSideEffect(currentStep.sideEffect);
    }

    // Give the DOM a tick to apply the side effect before measuring
    const delay = currentStep.sideEffect ? 200 : 0;
    retryRef.current = setTimeout(() => {
      attemptLocate(currentStep.id, currentStep.target, !!currentStep.skipIfTargetMissing);
    }, delay);

    return clearRetry;
  }, [currentStep, triggerSideEffect, attemptLocate]);

  // Reposition on resize / scroll
  useEffect(() => {
    if (!currentStep) return;
    const handler = () => {
      const rect = rectFromEl(currentStep.target);
      if (rect) setSpotlightRect(rect);
      if (cardRef.current) setCardHeight(cardRef.current.offsetHeight || 160);
    };
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [currentStep]);

  // Measure card height after render
  useEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight || 160);
  });

  if (!currentStep) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const placement = currentStep.placement ?? 'bottom';
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const bgColor = 'rgba(0,0,0,0.6)';
  const sr = spotlightRect;

  const fallbackRect: Rect = { top: vh / 2 - 40, left: vw / 2 - 40, width: 80, height: 80 };
  const cardStyle = computeCardStyle(
    sr ?? fallbackRect,
    sr ? placement : 'center',
    CARD_WIDTH,
    cardHeight,
    vw,
    vh,
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
      {/* While still searching for the target, backdrop is transparent to pointer events */}
      {sr ? (
        <>
          {/* top */}
          <div style={{ position: 'fixed', top: 0, left: 0, width: vw, height: Math.max(0, sr.top), background: bgColor, pointerEvents: 'auto' }} />
          {/* bottom */}
          <div style={{ position: 'fixed', top: sr.top + sr.height, left: 0, width: vw, height: Math.max(0, vh - sr.top - sr.height), background: bgColor, pointerEvents: 'auto' }} />
          {/* left */}
          <div style={{ position: 'fixed', top: sr.top, left: 0, width: Math.max(0, sr.left), height: sr.height, background: bgColor, pointerEvents: 'auto' }} />
          {/* right */}
          <div style={{ position: 'fixed', top: sr.top, left: sr.left + sr.width, width: Math.max(0, vw - sr.left - sr.width), height: sr.height, background: bgColor, pointerEvents: 'auto' }} />
          {/* spotlight ring */}
          <div style={{ position: 'fixed', top: sr.top, left: sr.left, width: sr.width, height: sr.height, borderRadius: 8, boxShadow: '0 0 0 2px rgba(139,92,246,0.8)', pointerEvents: 'none' }} />
        </>
      ) : !locating ? (
        // Target not found after retries (and skipIfTargetMissing is false) — show full backdrop
        <div style={{ position: 'fixed', inset: 0, background: bgColor, pointerEvents: 'auto' }} data-testid="tutorial-backdrop-full" />
      ) : null}

      {/* Tooltip card */}
      <div
        ref={cardRef}
        style={{ ...cardStyle, pointerEvents: 'auto', zIndex: 10000 }}
        className="bg-card border border-border rounded-xl shadow-2xl p-4 animate-in fade-in-0 zoom-in-95 duration-150"
        data-testid="tutorial-card"
      >
        <div className="flex items-start justify-between mb-2 gap-2">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
              Step {stepIndex + 1} of {steps.length}
            </span>
            <h3 className="text-sm font-semibold text-foreground mt-0.5">{currentStep.title}</h3>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors shrink-0"
            aria-label="Close tutorial"
            data-testid="tutorial-dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{currentStep.body}</p>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={dismiss}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            data-testid="tutorial-skip"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={prev} data-testid="tutorial-prev">
                Prev
              </Button>
            )}
            {isLast ? (
              <Button size="sm" className="h-7 text-xs px-3 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={complete} data-testid="tutorial-done">
                Done
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-xs px-3 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={next} data-testid="tutorial-next">
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
