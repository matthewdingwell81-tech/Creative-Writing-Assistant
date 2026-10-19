import { db, safetyFlags } from "@workspace/db";
import type { CoachSafetyResult } from "./coachSafety";

export class SafetyFlagPersistenceError extends Error {
  constructor() {
    super("Safety flag persistence failed");
    this.name = "SafetyFlagPersistenceError";
  }
}

/**
 * Keep writing private content only for an actual safety flag. The API sends
 * flagged content after this write succeeds so review records cannot be lost.
 */
export async function saveSafetyFlag(
  userId: string,
  feature: string,
  result: CoachSafetyResult,
): Promise<void> {
  if (result.flags.length === 0) return;
  try {
    await db.insert(safetyFlags).values({
      userId,
      feature,
      phases: result.flags,
      requestContext: result.requestContext,
      generatedContent: result.generatedContent,
    });
  } catch {
    throw new SafetyFlagPersistenceError();
  }
}
