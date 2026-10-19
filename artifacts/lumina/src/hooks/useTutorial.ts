import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { getTutorialPreferences, updateTutorialPreferences } from '@workspace/api-client-react';
import {
  type TourKey,
  type TutorialStep,
  FULL_TOUR,
  FEATURE_TOURS,
  initializeTutorialState,
  getTutorialDone,
  setTutorialDone,
} from '@/lib/tutorial';
import { useAuth } from '@/hooks/useAuth';

interface TutorialContextValue {
  tutorialsEnabled: boolean;
  tutorialsReady: boolean;
  tutorialsLoadingError: string | null;
  tutorialsSaveError: string | null;
  tutorialsSaving: boolean;
  retryTutorialPreferences: () => void;
  setTutorialsEnabled: (enabled: boolean) => Promise<void>;
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
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [tutorialsEnabled, setTutorialsEnabledState] = useState<boolean | null>(null);
  const [tutorialsLoadingError, setTutorialsLoadingError] = useState<string | null>(null);
  const [tutorialsSaveError, setTutorialsSaveError] = useState<string | null>(null);
  const [tutorialsSaving, setTutorialsSaving] = useState(false);
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

  const doneRef = useRef<Record<string, boolean>>({});
  const accountIdRef = useRef<string | null>(accountId);
  const sideEffectsRef = useRef<Record<string, () => void>>({});
  const preferenceVersionRef = useRef(0);
  const savingRef = useRef(false);
  const reloadPreferencesRef = useRef<(() => void) | null>(null);
  const tutorialsReady = !!accountId && loadedAccountId === accountId && tutorialsEnabled !== null;
  const canShowTutorials = tutorialsReady && tutorialsEnabled === true;
  const canShowTutorialsRef = useRef(false);
  canShowTutorialsRef.current = canShowTutorials;

  useEffect(() => {
    let active = true;
    let refreshing = false;
    preferenceVersionRef.current += 1;
    setLoadedAccountId(null);
    setTutorialsEnabledState(null);
    setTutorialsLoadingError(null);
    setTutorialsSaveError(null);
    setTutorialsSaving(false);
    savingRef.current = false;
    reloadPreferencesRef.current = null;

    if (!accountId) return;

    const load = async () => {
      if (!active || refreshing || savingRef.current) return;
      refreshing = true;
      const version = preferenceVersionRef.current;
      try {
        const preferences = await getTutorialPreferences();
        if (!active || version !== preferenceVersionRef.current) return;
        setTutorialsEnabledState(preferences.enabled);
        setLoadedAccountId(accountId);
        setTutorialsLoadingError(null);
      } catch {
        if (!active || version !== preferenceVersionRef.current) return;
        setTutorialsLoadingError("Tutorial settings couldn't be loaded. Retry before using tutorials.");
      } finally {
        refreshing = false;
      }
    };

    reloadPreferencesRef.current = () => { void load(); };
    void load();
    const interval = window.setInterval(() => { void load(); }, 30_000);
    const onFocus = () => { if (document.visibilityState !== "hidden") void load(); };
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      reloadPreferencesRef.current = null;
    };
  }, [accountId]);

  useEffect(() => {
    accountIdRef.current = accountId;
    if (accountId) initializeTutorialState(accountId);
    doneRef.current = accountId ? getTutorialDone(accountId) : {};
    setActiveTour(null);
    setSteps([]);
    setStepIndex(0);
  }, [accountId]);

  useEffect(() => {
    if (!canShowTutorials && activeTourRef.current) {
      setActiveTour(null);
      setSteps([]);
      setStepIndex(0);
    }
  }, [canShowTutorials]);

  const retryTutorialPreferences = useCallback(() => {
    reloadPreferencesRef.current?.();
  }, []);

  const setTutorialsEnabled = useCallback(async (enabled: boolean) => {
    const currentAccountId = accountIdRef.current;
    if (!currentAccountId || loadedAccountId !== currentAccountId || savingRef.current) return;
    const version = ++preferenceVersionRef.current;
    savingRef.current = true;
    setTutorialsSaving(true);
    setTutorialsSaveError(null);
    try {
      const saved = await updateTutorialPreferences({ enabled });
      if (accountIdRef.current !== currentAccountId || preferenceVersionRef.current !== version) return;
      setTutorialsEnabledState(saved.enabled);
      setLoadedAccountId(currentAccountId);
      setTutorialsLoadingError(null);
    } catch {
      if (accountIdRef.current === currentAccountId && preferenceVersionRef.current === version) {
        setTutorialsSaveError("Tutorial settings couldn't be saved. Please try again.");
      }
    } finally {
      if (preferenceVersionRef.current === version && accountIdRef.current === currentAccountId) {
        setTutorialsSaving(false);
        savingRef.current = false;
      }
    }
  }, [loadedAccountId]);

  const registerSideEffect = useCallback((key: string, handler: () => void) => {
    sideEffectsRef.current[key] = handler;
  }, []);

  const triggerSideEffect = useCallback((key: string) => {
    sideEffectsRef.current[key]?.();
  }, []);

  const closeTour = useCallback((markDone: boolean) => {
    const tour = activeTourRef.current;
    const currentAccountId = accountIdRef.current;
    if (markDone && tour && currentAccountId) {
      setTutorialDone(currentAccountId, tour);
      doneRef.current[tour] = true;
    }
    setActiveTour(null);
    setSteps([]);
    setStepIndex(0);
  }, []);

  const start = useCallback((key: TourKey) => {
    if (!canShowTutorialsRef.current) return;
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
    const currentAccountId = accountIdRef.current;
    if (!currentAccountId) return false;
    const latestDone = getTutorialDone(currentAccountId);
    doneRef.current = latestDone;
    return !!latestDone[key];
  }, []);

  const currentStep = canShowTutorials && activeTour && steps.length > 0 ? (steps[stepIndex] ?? null) : null;

  const value: TutorialContextValue = {
    tutorialsEnabled: canShowTutorials,
    tutorialsReady,
    tutorialsLoadingError,
    tutorialsSaveError,
    tutorialsSaving,
    retryTutorialPreferences,
    setTutorialsEnabled,
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
