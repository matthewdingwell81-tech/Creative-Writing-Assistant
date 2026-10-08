import { Router, type RequestHandler } from "express";
import { db, documents, coachHistory } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { SaveCoachHistoryBody } from "@workspace/api-zod";

export const COACH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export async function expireCoachHistory() {
  await db.execute(sql`UPDATE coach_history SET messages = '[]'::jsonb, draft = '', revision = revision + 1
    WHERE updated_at <= now() - interval '30 days' AND (messages <> '[]'::jsonb OR draft <> '')`);
}

const router = Router();
const authenticated: RequestHandler = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.session.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
};

// Lock the owned document for the entire operation, including first insert.
// This also serializes reset, expiry, import, and concurrent device writes.
for (const method of ["get", "put", "delete"] as const) {
  router[method]("/documents/:docId/coach-history", authenticated, async (req, res): Promise<void> => {
    const documentId = Number(req.params.docId);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      res.status(400).json({ error: "Invalid document ID" }); return;
    }
    const userId = req.session.userId!;
    await db.transaction(async tx => {
      const [owned] = await tx.select({ id: documents.id }).from(documents)
        .where(and(eq(documents.id, documentId), eq(documents.userId, userId))).for("update");
      if (!owned) { res.status(404).json({ error: "Document not found" }); return; }
      let [entry] = await tx.select().from(coachHistory)
        .where(and(eq(coachHistory.documentId, documentId), eq(coachHistory.userId, userId))).for("update");
      if (entry && Date.now() - entry.updatedAt.getTime() >= COACH_RETENTION_MS && (entry.messages.length || entry.draft)) {
        [entry] = await tx.update(coachHistory).set({ messages: [], draft: "", revision: entry.revision + 1 })
          .where(eq(coachHistory.documentId, documentId)).returning();
      }
      const snapshot = () => entry
        ? { messages: entry.messages, draft: entry.draft, revision: entry.revision, updatedAt: entry.updatedAt.getTime() }
        : { messages: [], draft: "", revision: 0, updatedAt: null };
      if (method === "get") { res.json(snapshot()); return; }
      let messages: typeof coachHistory.$inferSelect.messages = [];
      let draft = "", updatedAt = new Date();
      if (method === "put") {
        const parsed = SaveCoachHistoryBody.safeParse(req.body);
        if (!parsed.success || (parsed.success && (
          parsed.data.messages.length % 2 !== 0 ||
          parsed.data.messages.some((m, i) => m.role !== (i % 2 ? "assistant" : "user") || !m.content.trim())
        ))) { res.status(400).json({ error: "Only completed exchanges and drafts can be saved." }); return; }
        if (!Number.isSafeInteger(parsed.data.revision)) {
          res.status(400).json({ error: "Invalid revision" }); return;
        }
        if (parsed.data.revision !== (entry?.revision ?? 0)) {
          res.status(409).json({ error: "Coach history changed on another device. Reload to restore the latest history." }); return;
        }
        if (parsed.data.importedAt !== undefined) {
          const age = Date.now() - parsed.data.importedAt;
          if (!Number.isFinite(age) || age < 0 || age >= COACH_RETENTION_MS) {
            res.status(400).json({ error: "Device history has expired or has an invalid date." }); return;
          }
          updatedAt = new Date(parsed.data.importedAt);
        }
        messages = parsed.data.messages;
        draft = parsed.data.draft;
      }
      [entry] = await tx.insert(coachHistory).values({
        documentId, userId, messages, draft, updatedAt, revision: (entry?.revision ?? 0) + 1,
      }).onConflictDoUpdate({
        target: coachHistory.documentId,
        set: { messages, draft, updatedAt, revision: (entry?.revision ?? 0) + 1 },
      }).returning();
      res.json(snapshot());
    });
  });
}
export default router;
