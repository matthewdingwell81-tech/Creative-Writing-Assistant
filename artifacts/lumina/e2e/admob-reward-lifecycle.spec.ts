import { test, expect } from '@playwright/test';
import { playRewardedVideo, type RewardedVideoClient } from '../src/lib/rewardedVideo';
import { BannerSession } from '../src/lib/bannerSession';

test('banner dismissal is account-scoped and expires on a fresh app launch', () => {
  const currentLaunch = new BannerSession();
  expect(currentLaunch.isDismissed('account-a')).toBe(false);
  currentLaunch.dismiss('account-a');
  expect(currentLaunch.isDismissed('account-a')).toBe(true);
  expect(currentLaunch.isDismissed('account-b')).toBe(false);
  expect(new BannerSession().isDismissed('account-a')).toBe(false);
});

function mockVideo(outcome: 'completed' | 'skipped' | 'failed-show' | 'failed-load' | 'zero-reward') {
  let rewarded: ((reward: { amount: number }) => void) | undefined;
  let dismissed: (() => void) | undefined;
  let failed: (() => void) | undefined;
  let removedListeners = 0;
  const handle = () => ({ remove: async () => { removedListeners += 1; } });
  const client: RewardedVideoClient = {
    onRewarded: async (listener) => { rewarded = listener; return handle(); },
    onDismissed: async (listener) => { dismissed = listener; return handle(); },
    onFailedToShow: async (listener) => { failed = listener; return handle(); },
    prepare: async () => {
      if (outcome === 'failed-load') throw new Error('No ad available');
    },
    show: () => new Promise((resolve) => {
      queueMicrotask(() => {
        if (outcome === 'completed') {
          rewarded?.({ amount: 1 });
          resolve({ amount: 1 });
        } else if (outcome === 'skipped') {
          dismissed?.(); // Like Android, the show promise deliberately never settles.
        } else if (outcome === 'failed-show') {
          failed?.();
        } else {
          resolve({ amount: 0 });
        }
      });
    }),
  };
  return { client, removedCount: () => removedListeners };
}

for (const outcome of ['completed', 'skipped', 'failed-show', 'zero-reward'] as const) {
  test(`reward outcome: ${outcome}`, async () => {
    test.setTimeout(5_000);
    const mock = mockVideo(outcome);
    await expect(playRewardedVideo(mock.client)).resolves.toBe(outcome === 'completed');
    expect(mock.removedCount()).toBe(3);
  });
}

test('failed loading grants nothing and removes every listener', async () => {
  const mock = mockVideo('failed-load');
  await expect(playRewardedVideo(mock.client)).rejects.toThrow('No ad available');
  expect(mock.removedCount()).toBe(3);
});
