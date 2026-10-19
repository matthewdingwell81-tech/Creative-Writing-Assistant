import { db, safetyFlags } from "@workspace/db";
import { SafetyFlagPersistenceError, type SafetyFlagRecord } from "./coachSafety";

/**
 * Keep writing private content only for an actual safety flag. The API sends
 * flagged content after this write succeeds so review records cannot be lost.
 */
export async function saveSafetyFlag(
  userId: string,
  feature: string,
  result: SafetyFlagRecord,
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
