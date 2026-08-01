import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  type TourKey,
  type TutorialStep,
  FULL_TOUR,
  FEATURE_TOURS,
  getTutorialDone,
  setTutorialDone,
} from '@/lib/tutorial';

interface TutorialContextValue {
  activeTour: TourKey | null;
  steps: TutorialStep[];
  stepIndex: number;
  currentStep: TutorialStep | null;
  start: (key: TourKey) => void;
  next: () => void;
  prev: () => void;
  dismiss: () => void;
  complete: () => void;
  isDone: (key: string) => boolean;
  /** Called by TutorialOverlay when the current step's target cannot be found */
  skipCurrentStep: () => void;
  /** Register a named side-effect handler (e.g. 'openAssistant') from the UI layer */
  registerSideEffect: (key: string, handler: () => void) => void;
  /** Trigger a named side-effect (called by TutorialOverlay before measuring the target) */
  triggerSideEffect: (key: string) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [activeTour, setActiveTour] = useState<TourKey | null>(null);
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);

  // Keep a ref copy so callbacks don't capture stale state
  const activeTourRef = useRef<TourKey | null>(null);
  const stepsRef = useRef<TutorialStep[]>([]);
  const stepIndexRef = useRef(0);
  useEffect(() => { activeTourRef.current = activeTour; }, [activeTour]);
  useEffect(() => { stepsRef.current = steps; }, [steps]);
  useEffect(() => { stepIndexRef.current = stepIndex; }, [stepIndex]);

  const doneRef = useRef<Record<string, boolean>>(getTutorialDone());
  const sideEffectsRef = useRef<Record<string, () => void>>({});

  const registerSideEffect = useCallback((key: string, handler: () => void) => {
    sideEffectsRef.current[key] = handler;
  }, []);

  const triggerSideEffect = useCallback((key: string) => {
    sideEffectsRef.current[key]?.();
  }, []);

  const closeTour = useCallback((markDone: boolean) => {
    const tour = activeTourRef.current;
    if (markDone && tour) {
      setTutorialDone(tour);
      doneRef.current[tour] = true;
    }
    setActiveTour(null);
    setSteps([]);
    setStepIndex(0);
  }, []);

  const start = useCallback((key: TourKey) => {
    const tourSteps = key === 'full' ? FULL_TOUR : (FEATURE_TOURS[key] ?? []);
    if (tourSteps.length === 0) return;
    setSteps(tourSteps);
    setStepIndex(0);
    setActiveTour(key);
  }, []);

  const dismiss = useCallback(() => closeTour(false), [closeTour]);
  const complete = useCallback(() => closeTour(true), [closeTour]);

  const next = useCallback(() => {
    const idx = stepIndexRef.current;
    const len = stepsRef.current.length;
    if (idx >= len - 1) {
      closeTour(true);
    } else {
      setStepIndex(idx + 1);
    }
  }, [closeTour]);

  const skipCurrentStep = useCallback(() => {
    const idx = stepIndexRef.current;
    const len = stepsRef.current.length;
    if (idx >= len - 1) {
      closeTour(true);
    } else {
      setStepIndex(idx + 1);
    }
  }, [closeTour]);

  const prev = useCallback(() => {
    setStepIndex(p => Math.max(0, p - 1));
  }, []);

  const isDone = useCallback((key: string) => {
    return !!doneRef.current[key];
  }, []);

  const currentStep = activeTour && steps.length > 0 ? (steps[stepIndex] ?? null) : null;

  const value: TutorialContextValue = {
    activeTour,
    steps,
    stepIndex,
    currentStep,
    start,
    next,
    prev,
    dismiss,
    complete,
    isDone,
    skipCurrentStep,
    registerSideEffect,
    triggerSideEffect,
  };

  return React.createElement(TutorialContext.Provider, { value }, children);
}

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used inside TutorialProvider');
  return ctx;
}
