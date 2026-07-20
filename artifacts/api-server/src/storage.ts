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
} from "@workspace/db";
import { eq, desc, and, asc, sql } from "drizzle-orm";

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
  deleteChapter(id: number): Promise<void>;
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
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
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

  async deleteChapter(id: number): Promise<void> {
    await db.delete(chapters).where(eq(chapters.id, id));
  }
}

export const storage = new DatabaseStorage();
