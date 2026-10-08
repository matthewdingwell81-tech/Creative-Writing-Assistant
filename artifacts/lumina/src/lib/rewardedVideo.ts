interface ListenerHandle {
  remove: () => Promise<void>;
}

export interface RewardedVideoClient {
  onRewarded: (listener: (reward: { amount: number }) => void) => Promise<ListenerHandle>;
  onDismissed: (listener: () => void) => Promise<ListenerHandle>;
  onFailedToShow: (listener: () => void) => Promise<ListenerHandle>;
  prepare: () => Promise<unknown>;
  show: () => Promise<{ amount: number }>;
}

/** Dismissal must settle the app even when the native show promise stays pending. */
export async function playRewardedVideo(client: RewardedVideoClient): Promise<boolean> {
  let earnedReward = false;
  const listeners: ListenerHandle[] = [];
  let settleAdEvent!: (earned: boolean) => void;
  const adEvent = new Promise<boolean>((resolve) => {
    settleAdEvent = resolve;
  });

  try {
    listeners.push(await client.onRewarded((reward) => {
      if (Number.isFinite(reward.amount) && reward.amount > 0) earnedReward = true;
    }));
    listeners.push(await client.onDismissed(() => settleAdEvent(earnedReward)));
    listeners.push(await client.onFailedToShow(() => settleAdEvent(false)));
    await client.prepare();
    const showResult = client.show()
      .then((reward) =>
        earnedReward || (Number.isFinite(reward?.amount) && reward.amount > 0),
      )
      .catch(() => earnedReward);
    return await Promise.race([showResult, adEvent]);
  } finally {
    await Promise.all(listeners.map((listener) => listener.remove().catch(() => {})));
  }
}
