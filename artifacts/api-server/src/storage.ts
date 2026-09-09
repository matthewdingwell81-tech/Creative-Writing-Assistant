import { db } from "@workspace/db";
import {
  documents,
  ideas,
  users,
  chapters,
  type Document,
  type InsertDocument,
  type Idea,
  type InsertIdea,
  type User,
  type InsertUser,
  type Chapter,
  type InsertChapter,
  research,
  researchChapters,
  researchUploads,
  researchObjectDeletions,
  type Research,
  type InsertResearch,
} from "@workspace/db";
import { eq, desc, and, asc, sql, inArray } from "drizzle-orm";

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getDocuments(userId: string): Promise<Document[]>;
  getDocument(id: number, userId: string): Promise<Document | undefined>;
  createDocument(doc: InsertDocument): Promise<Document>;
  updateDocument(id: number, userId: string, updates: Partial<InsertDocument>): Promise<Document | undefined>;
  deleteDocument(id: number, userId: string): Promise<void>;
  getIdeasByDocument(documentId: number): Promise<Idea[]>;
  createIdea(idea: InsertIdea): Promise<Idea>;
  deleteIdea(id: number): Promise<void>;
  getChapters(documentId: number): Promise<Chapter[]>;
  getChapter(id: number): Promise<Chapter | undefined>;
  createChapter(chapter: InsertChapter): Promise<Chapter>;
  updateChapter(id: number, updates: Partial<InsertChapter>): Promise<Chapter | undefined>;
  reorderChapters(documentId: number, chapterIds: number[]): Promise<Chapter[]>;
  deleteChapter(id: number, userId: string): Promise<boolean>;
  getResearch(documentId: number, options?: { keyword?: string; tag?: string; chapterId?: number; scope?: string }): Promise<Array<Research & { chapterIds: number[] }>>;
  getResearchById(id: number, userId: string): Promise<Research | undefined>;
  getResearchByObjectPath(objectPath: string, userId: string): Promise<Research | undefined>;
  createResearch(value: InsertResearch): Promise<Research>;
  updateResearch(id: number, userId: string, value: Partial<InsertResearch>): Promise<Research | undefined>;
  deleteResearch(id: number, userId: string): Promise<void>;
  attachResearch(id: number, chapterId: number, userId: string): Promise<boolean>;
  detachResearch(id: number, chapterId: number, userId: string): Promise<void>;
  createResearchUpload(value: { objectPath: string; userId: string; originalName: string; mimeType: string; size: number }): Promise<void>;
  getResearchUpload(objectPath: string, userId: string): Promise<{ objectPath: string; mimeType: string; size: number; claimedResearchId: number | null } | undefined>;
  deleteResearchUpload(objectPath: string, userId: string): Promise<void>;
  listResearchObjectDeletions(userId: string): Promise<string[]>;
  completeResearchObjectDeletion(objectPath: string, userId: string): Promise<void>;
  createResearchWithScope(value: InsertResearch, chapterIds: number[], userId: string): Promise<(Research & { chapterIds: number[] }) | undefined>;
  updateResearchWithScope(id: number, value: Partial<InsertResearch>, chapterIds: number[] | undefined, userId: string): Promise<(Research & { chapterIds: number[] }) | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getDocuments(userId: string): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.userId, userId)).orderBy(desc(documents.updatedAt));
  }

  async getDocument(id: number, userId: string): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
    return doc;
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(doc).returning();
    return created;
  }

  async updateDocument(id: number, userId: string, updates: Partial<InsertDocument>): Promise<Document | undefined> {
    const [updated] = await db
      .update(documents)
      .set({ ...updates, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return updated;
  }

  async deleteDocument(id: number, userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${id})`);
      const [ownedDocument] = await tx.select({ id: documents.id }).from(documents)
        .where(and(eq(documents.id, id), eq(documents.userId, userId)));
      if (!ownedDocument) return;
      const images = await tx.select({ objectPath: research.objectPath }).from(research)
        .innerJoin(documents, eq(research.documentId, documents.id))
        .where(and(eq(documents.id, id), eq(documents.userId, userId), sql`${research.objectPath} IS NOT NULL`));
      if (images.length) {
        await tx.insert(researchObjectDeletions).values(images.map(({ objectPath }) => ({ objectPath: objectPath!, userId }))).onConflictDoNothing();
      }
      await tx.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
    });
  }

  async getIdeasByDocument(documentId: number): Promise<Idea[]> {
    return db.select().from(ideas).where(eq(ideas.documentId, documentId)).orderBy(desc(ideas.createdAt));
  }

  async createIdea(idea: InsertIdea): Promise<Idea> {
    const [created] = await db.insert(ideas).values(idea).returning();
    return created;
  }

  async deleteIdea(id: number): Promise<void> {
    await db.delete(ideas).where(eq(ideas.id, id));
  }

  async getChapters(documentId: number): Promise<Chapter[]> {
    return db.select().from(chapters).where(eq(chapters.documentId, documentId)).orderBy(asc(chapters.position));
  }

  async getChapter(id: number): Promise<Chapter | undefined> {
    const [chapter] = await db.select().from(chapters).where(eq(chapters.id, id));
    return chapter;
  }

  async createChapter(chapter: InsertChapter): Promise<Chapter> {
    const [created] = await db.insert(chapters).values(chapter).returning();
    return created;
  }

  async updateChapter(id: number, updates: Partial<InsertChapter>): Promise<Chapter | undefined> {
    const [updated] = await db
      .update(chapters)
      .set(updates)
      .where(eq(chapters.id, id))
      .returning();
    return updated;
  }

  async reorderChapters(documentId: number, chapterIds: number[]): Promise<Chapter[]> {
    return db.transaction(async (tx) => {
      for (const [position, chapterId] of chapterIds.entries()) {
        await tx
          .update(chapters)
          .set({ position })
          .where(and(eq(chapters.id, chapterId), eq(chapters.documentId, documentId)));
      }

      return tx
        .select()
        .from(chapters)
        .where(eq(chapters.documentId, documentId))
        .orderBy(asc(chapters.position));
    });
  }

  async deleteChapter(id: number, userId: string): Promise<boolean> {
    const existing = await this.getChapter(id);
    if (!existing) return false;
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${existing.documentId})`);
      const [chapter] = await tx.select({ id: chapters.id }).from(chapters)
        .innerJoin(documents, eq(chapters.documentId, documents.id))
        .where(and(eq(chapters.id, id), eq(documents.userId, userId)));
      if (!chapter) return false;
      const linked = await tx.select({ researchId: researchChapters.researchId }).from(researchChapters)
        .where(eq(researchChapters.chapterId, id));
      const researchIds = [...new Set(linked.map(row => row.researchId))];
      if (researchIds.length) {
        await tx.select({ id: research.id }).from(research).where(inArray(research.id, researchIds)).for("update");
      }
      await tx.delete(chapters).where(eq(chapters.id, id));
      if (researchIds.length) {
        await tx.update(research).set({ isGlobal: true }).where(and(
          inArray(research.id, researchIds),
          sql`NOT EXISTS (SELECT 1 FROM ${researchChapters} rc WHERE rc.research_id = ${research.id})`
        ));
      }
      return true;
    });
  }

  async getResearch(documentId: number, options: { keyword?: string; tag?: string; chapterId?: number; scope?: string } = {}): Promise<Array<Research & { chapterIds: number[] }>> {
    const rows = await db.select({ r: research, chapterId: researchChapters.chapterId }).from(research)
      .leftJoin(researchChapters, eq(research.id, researchChapters.researchId))
      .where(eq(research.documentId, documentId)).orderBy(desc(research.updatedAt));
    const grouped = new Map<number, Research & { chapterIds: number[] }>();
    for (const row of rows) {
      const item = grouped.get(row.r.id) ?? { ...row.r, chapterIds: [] };
      if (row.chapterId !== null && !item.chapterIds.includes(row.chapterId)) item.chapterIds.push(row.chapterId);
      grouped.set(row.r.id, item);
    }
    return [...grouped.values()].filter(r => {
      if (options.chapterId !== undefined && !r.isGlobal && !r.chapterIds.includes(options.chapterId)) return false;
      const text = `${r.title} ${r.content} ${r.url ?? ""}`.toLowerCase();
      if (options.keyword && !text.includes(options.keyword.toLowerCase())) return false;
      if (options.tag && !(r.tags || []).some(t => t.toLowerCase() === options.tag!.toLowerCase())) return false;
      if (options.scope === "global" && !r.isGlobal) return false;
      if (options.scope === "chapter" && r.isGlobal) return false;
      return true;
    });
  }
  async getResearchById(id: number, userId: string): Promise<Research | undefined> {
    const [row] = await db.select({ r: research }).from(research).innerJoin(documents, eq(research.documentId, documents.id))
      .where(and(eq(research.id, id), eq(documents.userId, userId)));
    return row?.r;
  }
  async getResearchByObjectPath(objectPath: string, userId: string): Promise<Research | undefined> {
    const [row] = await db.select({ r: research }).from(research).innerJoin(documents, eq(research.documentId, documents.id))
      .where(and(eq(research.objectPath, objectPath), eq(documents.userId, userId)));
    return row?.r;
  }
  async createResearch(value: InsertResearch): Promise<Research> { const [r] = await db.insert(research).values(value).returning(); return r; }
  async createResearchUpload(value: { objectPath: string; userId: string; originalName: string; mimeType: string; size: number }): Promise<void> {
    await db.insert(researchUploads).values(value);
  }
  async getResearchUpload(objectPath: string, userId: string) {
    const [upload] = await db.select({
      objectPath: researchUploads.objectPath,
      mimeType: researchUploads.mimeType,
      size: researchUploads.size,
      claimedResearchId: researchUploads.claimedResearchId,
    }).from(researchUploads).where(and(eq(researchUploads.objectPath, objectPath), eq(researchUploads.userId, userId)));
    return upload;
  }
  async deleteResearchUpload(objectPath: string, userId: string): Promise<void> {
    await db.delete(researchUploads).where(and(eq(researchUploads.objectPath, objectPath), eq(researchUploads.userId, userId)));
  }
  async listResearchObjectDeletions(userId: string): Promise<string[]> {
    const pending = await db.update(researchObjectDeletions)
      .set({ lastAttemptAt: sql`CURRENT_TIMESTAMP`, attempts: sql`${researchObjectDeletions.attempts} + 1` })
      .where(eq(researchObjectDeletions.userId, userId))
      .returning({ objectPath: researchObjectDeletions.objectPath });
    return pending.map(row => row.objectPath);
  }
  async completeResearchObjectDeletion(objectPath: string, userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(researchUploads).where(and(eq(researchUploads.objectPath, objectPath), eq(researchUploads.userId, userId)));
      await tx.delete(researchObjectDeletions).where(and(eq(researchObjectDeletions.objectPath, objectPath), eq(researchObjectDeletions.userId, userId)));
    });
  }
  async createResearchWithScope(value: InsertResearch, chapterIds: number[], userId: string): Promise<(Research & { chapterIds: number[] }) | undefined> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${value.documentId})`);
      const [ownedDocument] = await tx.select({ id: documents.id }).from(documents)
        .where(and(eq(documents.id, value.documentId), eq(documents.userId, userId)));
      if (!ownedDocument) return undefined;
      if (!value.isGlobal) {
        const ownedChapters = await tx.select({ id: chapters.id }).from(chapters)
          .where(and(eq(chapters.documentId, value.documentId), inArray(chapters.id, chapterIds)));
        if (ownedChapters.length !== chapterIds.length) return undefined;
      }
      const [created] = await tx.insert(research).values(value).returning();
      if (!value.isGlobal) {
        await tx.insert(researchChapters).values(chapterIds.map(chapterId => ({ researchId: created.id, chapterId })));
      }
      if (created.objectPath) {
        const [claimed] = await tx.update(researchUploads)
          .set({ claimedResearchId: created.id, claimedAt: sql`CURRENT_TIMESTAMP` })
          .where(and(
            eq(researchUploads.objectPath, created.objectPath),
            eq(researchUploads.userId, userId),
            sql`${researchUploads.claimedResearchId} IS NULL`
          )).returning();
        if (!claimed) throw new Error("Upload is unavailable");
      }
      return { ...created, chapterIds: value.isGlobal ? [] : chapterIds };
    });
  }
  async updateResearchWithScope(id: number, value: Partial<InsertResearch>, chapterIds: number[] | undefined, userId: string): Promise<(Research & { chapterIds: number[] }) | undefined> {
    const beforeLock = await this.getResearchById(id, userId);
    if (!beforeLock) return undefined;
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${beforeLock.documentId})`);
      const [existingRow] = await tx.select({ item: research }).from(research)
        .innerJoin(documents, eq(research.documentId, documents.id))
        .where(and(eq(research.id, id), eq(documents.userId, userId)));
      if (!existingRow) return undefined;
      const existing = existingRow.item;
      const isGlobal = value.isGlobal ?? existing.isGlobal;
      const currentLinks = chapterIds === undefined
        ? await tx.select({ chapterId: researchChapters.chapterId }).from(researchChapters).where(eq(researchChapters.researchId, id))
        : [];
      const effectiveChapterIds = isGlobal
        ? []
        : (chapterIds ?? currentLinks.map(link => link.chapterId));
      if (!isGlobal && effectiveChapterIds.length === 0) return undefined;
      if (isGlobal && chapterIds !== undefined && chapterIds.length > 0) return undefined;
      if (!isGlobal) {
        const ownedChapters = await tx.select({ id: chapters.id }).from(chapters)
          .where(and(eq(chapters.documentId, existing.documentId), inArray(chapters.id, effectiveChapterIds)));
        if (ownedChapters.length !== effectiveChapterIds.length) return undefined;
      }
      const [updated] = await tx.update(research).set({ ...value, isGlobal, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(research.id, id)).returning();
      await tx.delete(researchChapters).where(eq(researchChapters.researchId, id));
      if (!isGlobal) {
        await tx.insert(researchChapters).values(effectiveChapterIds.map(chapterId => ({ researchId: id, chapterId })));
      }
      if (updated.objectPath && updated.objectPath !== existing.objectPath) {
        const [claimed] = await tx.update(researchUploads)
          .set({ claimedResearchId: id, claimedAt: sql`CURRENT_TIMESTAMP` })
          .where(and(
            eq(researchUploads.objectPath, updated.objectPath),
            eq(researchUploads.userId, userId),
            sql`${researchUploads.claimedResearchId} IS NULL`
          )).returning();
        if (!claimed) throw new Error("Upload is unavailable");
      }
      if (existing.objectPath && existing.objectPath !== updated.objectPath) {
        await tx.insert(researchObjectDeletions).values({ objectPath: existing.objectPath, userId }).onConflictDoNothing();
      }
      return { ...updated, chapterIds: effectiveChapterIds };
    });
  }
  async updateResearch(id: number, userId: string, value: Partial<InsertResearch>): Promise<Research | undefined> {
    const [r] = await db.update(research).set({ ...value, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(research.id, id), sql`EXISTS (SELECT 1 FROM documents WHERE documents.id = ${research.documentId} AND documents.user_id = ${userId})`)).returning(); return r;
  }
  async deleteResearch(id: number, userId: string): Promise<void> {
    const beforeLock = await this.getResearchById(id, userId);
    if (!beforeLock) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${beforeLock.documentId})`);
      const [owned] = await tx.select({ objectPath: research.objectPath }).from(research)
        .innerJoin(documents, eq(research.documentId, documents.id))
        .where(and(eq(research.id, id), eq(documents.userId, userId)));
      if (!owned) return;
      if (owned.objectPath) {
        await tx.insert(researchObjectDeletions).values({ objectPath: owned.objectPath, userId }).onConflictDoNothing();
      }
      await tx.delete(research).where(eq(research.id, id));
    });
  }
  async attachResearch(id: number, chapterId: number, userId: string): Promise<boolean> {
    const beforeLock = await this.getResearchById(id, userId);
    if (!beforeLock) return false;
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${beforeLock.documentId})`);
      const [ownedResearch] = await tx.select({ id: research.id }).from(research)
        .innerJoin(documents, eq(research.documentId, documents.id))
        .where(and(eq(research.id, id), eq(documents.userId, userId)));
      const [ownedChapter] = await tx.select({ id: chapters.id }).from(chapters)
        .where(and(eq(chapters.id, chapterId), eq(chapters.documentId, beforeLock.documentId)));
      if (!ownedResearch || !ownedChapter) return false;
      await tx.insert(researchChapters).values({ researchId: id, chapterId }).onConflictDoNothing();
      await tx.update(research).set({ isGlobal: false }).where(eq(research.id, id));
      return true;
    });
  }
  async detachResearch(id: number, chapterId: number, userId: string): Promise<void> {
    const beforeLock = await this.getResearchById(id, userId);
    if (!beforeLock) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${beforeLock.documentId})`);
      const [ownedResearch] = await tx.select({ id: research.id }).from(research)
        .innerJoin(documents, eq(research.documentId, documents.id))
        .where(and(eq(research.id, id), eq(documents.userId, userId)));
      if (!ownedResearch) return;
      await tx.delete(researchChapters).where(and(eq(researchChapters.researchId, id), eq(researchChapters.chapterId, chapterId)));
      const remaining = await tx.select({ id: researchChapters.chapterId }).from(researchChapters).where(eq(researchChapters.researchId, id));
      if (remaining.length === 0) await tx.update(research).set({ isGlobal: true }).where(eq(research.id, id));
    });
  }
}

export const storage = new DatabaseStorage();
