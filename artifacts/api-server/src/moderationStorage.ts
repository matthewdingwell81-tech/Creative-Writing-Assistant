import { and, desc, eq } from "drizzle-orm";
import { db, safetyFlags, users } from "@workspace/db";
import { storage } from "./storage";
import type { ModerationRepository } from "./routes/moderation";

export const moderationRepository: ModerationRepository = {
  getUserById: id => storage.getUserById(id),
  async listFlags(status) {
    const query = db.select({
      id: safetyFlags.id,
      userId: safetyFlags.userId,
      username: users.username,
      feature: safetyFlags.feature,
      phases: safetyFlags.phases,
      requestContext: safetyFlags.requestContext,
      generatedContent: safetyFlags.generatedContent,
      status: safetyFlags.status,
      createdAt: safetyFlags.createdAt,
      reviewedAt: safetyFlags.reviewedAt,
      reviewerNote: safetyFlags.reviewerNote,
    }).from(safetyFlags)
      .innerJoin(users, eq(safetyFlags.userId, users.id))
      .orderBy(desc(safetyFlags.createdAt))
      .limit(100);
    return status === "all" ? query : query.where(eq(safetyFlags.status, status));
  },
  async reviewFlag(id, decision, note, reviewerId) {
    const [updated] = await db.update(safetyFlags).set({
      status: decision,
      reviewedAt: new Date(),
      reviewedBy: reviewerId,
      reviewerNote: note,
      // Minimize private-text retention once the administrator has decided.
      requestContext: null,
      generatedContent: null,
    }).where(and(eq(safetyFlags.id, id), eq(safetyFlags.status, "open"))).returning({
      id: safetyFlags.id,
      status: safetyFlags.status,
      reviewedAt: safetyFlags.reviewedAt,
    });
    return updated;
  },
};
