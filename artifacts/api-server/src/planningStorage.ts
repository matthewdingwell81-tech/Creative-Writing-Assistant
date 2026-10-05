import { db, documents, chapters, storyPlanning, type PlanningInput, type StoryPlanning } from "@workspace/db";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class PlanningError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function inOwnedStory<T>(documentId: number, userId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    // Share the lock used by document/chapter deletion and research mutations.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${documentId})`);
    const [owned] = await tx.select({ id: documents.id }).from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
    if (!owned) throw new PlanningError(404, "Story not found.");
    return work(tx);
  });
}

async function validateLinks(tx: Transaction, documentId: number, input: PlanningInput) {
  if (input.chapterId != null) {
    const [chapter] = await tx.select({ id: chapters.id }).from(chapters)
      .where(and(eq(chapters.id, input.chapterId), eq(chapters.documentId, documentId)));
    if (!chapter) throw new PlanningError(400, "Select a chapter from this story.");
  }
  const characterIds = [...new Set([input.characterId, input.relatedCharacterId].filter((id): id is number => id != null))];
  if (characterIds.length) {
    const characters = await tx.select({ id: storyPlanning.id }).from(storyPlanning)
      .where(and(eq(storyPlanning.documentId, documentId), eq(storyPlanning.kind, "character"), inArray(storyPlanning.id, characterIds)));
    if (characters.length !== characterIds.length) throw new PlanningError(400, "Select characters from this story.");
  }
  if (input.kind === "relationship") {
    if (!input.characterId || !input.relatedCharacterId || input.characterId === input.relatedCharacterId) {
      throw new PlanningError(400, "A relationship needs two different characters.");
    }
  } else if (input.relatedCharacterId != null) {
    throw new PlanningError(400, "A second character is only supported for relationships.");
  }
  if (input.kind === "character" && input.characterId != null) {
    throw new PlanningError(400, "Character outlines cannot link to another character. Add a relationship instead.");
  }
}

async function listInTransaction(tx: Transaction, documentId: number) {
  return tx.select().from(storyPlanning).where(eq(storyPlanning.documentId, documentId))
    .orderBy(asc(storyPlanning.position), asc(storyPlanning.id));
}

export async function listPlanning(documentId: number, userId: string): Promise<StoryPlanning[]> {
  return inOwnedStory(documentId, userId, tx => listInTransaction(tx, documentId));
}

export async function savePlanning(documentId: number, userId: string, input: Partial<PlanningInput>, id?: number): Promise<StoryPlanning> {
  return inOwnedStory(documentId, userId, async tx => {
    const [existing] = id === undefined ? [] : await tx.select().from(storyPlanning)
      .where(and(eq(storyPlanning.id, id), eq(storyPlanning.documentId, documentId)));
    if (id !== undefined && !existing) throw new PlanningError(404, "Planning entry not found.");
    if (existing && input.kind !== undefined && input.kind !== existing.kind) {
      throw new PlanningError(400, "The type of a planning entry cannot be changed.");
    }
    const effective = { ...existing, ...input } as PlanningInput;
    await validateLinks(tx, documentId, effective);
    if (existing) {
      const [updated] = await tx.update(storyPlanning).set({ ...input, updatedAt: new Date() })
        .where(eq(storyPlanning.id, existing.id)).returning();
      return updated;
    }
    const [last] = await tx.select({ position: sql<number>`COALESCE(MAX(${storyPlanning.position}), -1)` })
      .from(storyPlanning).where(and(eq(storyPlanning.documentId, documentId), eq(storyPlanning.kind, effective.kind)));
    const [created] = await tx.insert(storyPlanning).values({
      ...effective, documentId, position: Number(last.position) + 1,
    }).returning();
    return created;
  });
}

export async function removePlanning(documentId: number, userId: string, id: number) {
  return inOwnedStory(documentId, userId, async tx => {
    const [existing] = await tx.select().from(storyPlanning)
      .where(and(eq(storyPlanning.id, id), eq(storyPlanning.documentId, documentId)));
    if (!existing) throw new PlanningError(404, "Planning entry not found.");
    if (existing.kind === "character") {
      // Relationships require both endpoints; notes/events remain after unlinking.
      await tx.delete(storyPlanning).where(and(
        eq(storyPlanning.documentId, documentId), eq(storyPlanning.kind, "relationship"),
        or(eq(storyPlanning.characterId, id), eq(storyPlanning.relatedCharacterId, id)),
      ));
    }
    await tx.delete(storyPlanning).where(eq(storyPlanning.id, id));
  });
}

export async function orderPlanning(documentId: number, userId: string, kind: PlanningInput["kind"], ids: number[]) {
  return inOwnedStory(documentId, userId, async tx => {
    const current = await tx.select({ id: storyPlanning.id }).from(storyPlanning)
      .where(and(eq(storyPlanning.documentId, documentId), eq(storyPlanning.kind, kind)));
    const expected = new Set(current.map(row => row.id));
    if (ids.length !== expected.size || new Set(ids).size !== ids.length || ids.some(id => !expected.has(id))) {
      throw new PlanningError(400, "Order must include every entry of this type exactly once.");
    }
    for (const [position, id] of ids.entries()) {
      await tx.update(storyPlanning).set({ position, updatedAt: new Date() }).where(eq(storyPlanning.id, id));
    }
    return listInTransaction(tx, documentId);
  });
}
