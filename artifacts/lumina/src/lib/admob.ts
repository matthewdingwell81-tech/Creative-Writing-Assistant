import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdPluginEvents,
  BannerAdSize,
  RewardAdPluginEvents,
} from "@capacitor-community/admob";
import { isPremiumAccount } from "@/hooks/useAdRewards";
import { playRewardedVideo } from "./rewardedVideo";
import { bannerSession } from "./bannerSession";

export const TEST_BANNER_AD_ID = "ca-app-pub-3940256099942544/6300978111";
export const TEST_REWARDED_AD_ID = "ca-app-pub-3940256099942544/5224354917";
export const BANNER_HEIGHT_EVENT = "lumina:admob-banner-height";

let initialization: Promise<boolean> | null = null;
let initialized = false;
let bannerVisible = false;
let bannerRequested = false;
let bannerSizeListenerInstalled = false;
let rewardInProgress = false;

function publishBannerHeight(height: number) {
  if (typeof window === "undefined") return;
  document.documentElement.style.setProperty(
    "--lumina-admob-banner-height",
    `${height}px`,
  );
  window.dispatchEvent(
    new CustomEvent(BANNER_HEIGHT_EVENT, { detail: { height } }),
  );
}

function listenForBannerSize() {
  if (bannerSizeListenerInstalled) return;
  bannerSizeListenerInstalled = true;
  void AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => {
    if (!bannerRequested) return;
    publishBannerHeight(Math.max(0, Math.ceil(height)));
  }).catch(() => {
    bannerSizeListenerInstalled = false;
  });
  void AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
    bannerVisible = false;
    bannerRequested = false;
    publishBannerHeight(0);
  }).catch(() => {});
}

/** Consent is collected before the native SDK is initialized or requests ads. */
export function initializeAdMob(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(false);
  if (initialized) return Promise.resolve(true);
  if (initialization) return initialization;

  initialization = (async () => {
    const consent = await AdMob.requestConsentInfo();
    const resolvedConsent =
      consent.status === AdmobConsentStatus.REQUIRED &&
      consent.isConsentFormAvailable
        ? await AdMob.showConsentForm()
        : consent;

    if (!resolvedConsent.canRequestAds) return false;

    await AdMob.initialize({ initializeForTesting: true });
    initialized = true;
    listenForBannerSize();
    return true;
  })()
    .catch((error: unknown) => {
      if (import.meta.env.DEV) {
        console.warn("AdMob is unavailable until consent and initialization succeed.", error);
      }
      return false;
    })
    .finally(() => {
      if (!initialized) initialization = null;
    });

  return initialization;
}

export async function showBannerForAccount(
  accountId: string,
  canShow: () => boolean = () => true,
): Promise<void> {
  if (
    !accountId ||
    !canShow() ||
    bannerSession.isDismissed(accountId) ||
    !Capacitor.isNativePlatform() ||
    isPremiumAccount(accountId) ||
    !(await initializeAdMob())
  ) {
    return;
  }

  if (bannerVisible || !canShow() || bannerSession.isDismissed(accountId) || isPremiumAccount(accountId)) return;

  bannerRequested = true;
  try {
    await AdMob.showBanner({
      adId: TEST_BANNER_AD_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
    });
  } catch (error) {
    bannerRequested = false;
    publishBannerHeight(0);
    throw error;
  }
  if (!bannerRequested || !canShow() || bannerSession.isDismissed(accountId) || isPremiumAccount(accountId)) {
    bannerVisible = true;
    await removeAdMobBanner();
    return;
  }
  bannerVisible = true;
  publishBannerHeight(50);
}

export async function removeAdMobBanner(): Promise<void> {
  bannerRequested = false;
  if (!Capacitor.isNativePlatform() || !initialized || !bannerVisible) {
    publishBannerHeight(0);
    return;
  }

  try {
    await AdMob.removeBanner();
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Could not remove the AdMob banner.", error);
  } finally {
    bannerVisible = false;
    publishBannerHeight(0);
  }
}

export async function dismissBannerForAccount(accountId: string): Promise<void> {
  bannerSession.dismiss(accountId);
  await removeAdMobBanner();
}

export async function showRewardedAdForAccount(accountId: string): Promise<boolean> {
  if (
    !accountId ||
    !Capacitor.isNativePlatform() ||
    isPremiumAccount(accountId) ||
    rewardInProgress
  ) {
    return false;
  }

  rewardInProgress = true;

  try {
    if (!(await initializeAdMob()) || isPremiumAccount(accountId)) return false;
    return await playRewardedVideo({
      onRewarded: (listener) => AdMob.addListener(RewardAdPluginEvents.Rewarded, listener),
      onDismissed: (listener) => AdMob.addListener(RewardAdPluginEvents.Dismissed, listener),
      onFailedToShow: (listener) => AdMob.addListener(RewardAdPluginEvents.FailedToShow, listener),
      prepare: async () => {
        await AdMob.prepareRewardVideoAd({ adId: TEST_REWARDED_AD_ID });
        if (isPremiumAccount(accountId)) throw new Error("Premium accounts do not show ads.");
      },
      show: () => AdMob.showRewardVideoAd({ adId: TEST_REWARDED_AD_ID }),
    });
  } finally {
    rewardInProgress = false;
  }
}

export function subscribeToBannerHeight(
  listener: (height: number) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onHeight = (event: Event) => {
    const height = (event as CustomEvent<{ height: number }>).detail?.height;
    if (Number.isFinite(height)) listener(Math.max(0, height));
  };
  window.addEventListener(BANNER_HEIGHT_EVENT, onHeight);
  return () => window.removeEventListener(BANNER_HEIGHT_EVENT, onHeight);
}
