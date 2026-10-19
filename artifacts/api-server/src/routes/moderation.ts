import { Router, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, safetyFlags, users } from "@workspace/db";
import { storage } from "../storage";
import { isDeveloperUid } from "../lib/developerAccess";

const router = Router();

async function requireDeveloper(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const user = await storage.getUserById(userId);
    if (!user || !isDeveloperUid(user.firebaseUid)) {
      res.status(403).json({ error: "Administrator access required." });
      return;
    }
    next();
  } catch {
    res.status(503).json({ error: "Could not verify administrator access." });
  }
}

router.get("/safety-flags", requireDeveloper, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "open";
  if (!["open", "all", "confirmed_violation", "no_violation"].includes(status)) {
    res.status(400).json({ error: "Invalid flag status." });
    return;
  }
  const condition = status === "all" ? undefined : eq(safetyFlags.status, status);
  const query = db
    .select({
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
    })
    .from(safetyFlags)
    .innerJoin(users, eq(safetyFlags.userId, users.id))
    .orderBy(desc(safetyFlags.createdAt))
    .limit(100);
  const rows = await (condition ? query.where(condition) : query);
  res.set("Cache-Control", "no-store").json({ flags: rows });
});

router.post("/safety-flags/:id/review", requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  const { decision, note } = req.body ?? {};
  if (
    !Number.isSafeInteger(id) || id <= 0 ||
    !["confirmed_violation", "no_violation"].includes(decision) ||
    (note !== undefined && (typeof note !== "string" || note.length > 2_000))
  ) {
    res.status(400).json({ error: "Invalid review decision." });
    return;
  }
  const [updated] = await db.update(safetyFlags).set({
    status: decision,
    reviewedAt: new Date(),
    reviewedBy: req.session.userId!,
    reviewerNote: typeof note === "string" && note.trim() ? note.trim() : null,
    // The reviewer decision is retained, but private writing is removed once
    // it is no longer needed to make the decision.
    requestContext: null,
    generatedContent: null,
  }).where(and(eq(safetyFlags.id, id), eq(safetyFlags.status, "open"))).returning({
    id: safetyFlags.id,
    status: safetyFlags.status,
    reviewedAt: safetyFlags.reviewedAt,
  });
  if (!updated) {
    res.status(409).json({ error: "This flag has already been reviewed or no longer exists." });
    return;
  }
  res.json(updated);
});

export default router;
