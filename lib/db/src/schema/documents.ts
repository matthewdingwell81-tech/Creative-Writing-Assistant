import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled"),
  content: text("content").notNull().default(""),
  documentType: text("document_type").notNull().default("fiction"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertDocumentSchema = z.object({
  userId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  documentType: z.string().optional(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
