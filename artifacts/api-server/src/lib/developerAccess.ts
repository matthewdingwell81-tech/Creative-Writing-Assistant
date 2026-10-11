import developerIds from "./developerIds.json";

/** Only call with an independently verified/stored Firebase UID. */
export function isDeveloperUid(uid: string | null | undefined): boolean {
  return Boolean(uid && developerIds.includes(uid));
}
