import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, boolean, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { z } from "zod";
import { documents } from "./documents";
import { chapters } from "./chapters";
import { users } from "./users";

export const research = pgTable("research", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  type: text("type").notNull().default("text"),
  url: text("url"),
  objectPath: text("object_path"),
  mimeType: text("mime_type"),
  size: integer("size"),
  tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  isGlobal: boolean("is_global").notNull().default(true),
  favorite: boolean("favorite").notNull().default(false),
  important: boolean("important").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [index("research_document_id_idx").on(t.documentId)]);

export const researchChapters = pgTable("research_chapters", {
  researchId: integer("research_id").notNull().references(() => research.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
}, (t) => [unique().on(t.researchId, t.chapterId)]);

export const researchUploads = pgTable("research_uploads", {
  objectPath: text("object_path").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  claimedResearchId: integer("claimed_research_id").references(() => research.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  claimedAt: timestamp("claimed_at"),
}, (t) => [index("research_uploads_user_id_idx").on(t.userId)]);

export const researchObjectDeletions = pgTable("research_object_deletions", {
  objectPath: text("object_path").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastAttemptAt: timestamp("last_attempt_at"),
  attempts: integer("attempts").notNull().default(0),
}, (t) => [index("research_object_deletions_user_id_idx").on(t.userId)]);

export const insertResearchSchema = z.object({
  documentId: z.number().int(),
  title: z.string().min(1),
  content: z.string().optional(),
  type: z.enum(["text", "link", "image"]).default("text"),
  url: z.string().url().optional().nullable(),
  objectPath: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  size: z.number().int().nonnegative().optional().nullable(),
  tags: z.array(z.string()).default([]),
  isGlobal: z.boolean().default(true),
  favorite: z.boolean().default(false),
  important: z.boolean().default(false),
});
export type Research = typeof research.$inferSelect;
export type InsertResearch = z.infer<typeof insertResearchSchema>;
export type ResearchUpload = typeof researchUploads.$inferSelect;