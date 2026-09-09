import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { z } from "zod";
import { documents } from "./documents";

export const chapters = pgTable("chapters", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Chapter 1"),
  content: text("content").notNull().default(""),
  position: integer("position").notNull().default(0),
  cardColor: text("card_color").notNull().default("lavender"),
  synopsis: text("synopsis").notNull().default(""),
});

export const insertChapterSchema = z.object({
  documentId: z.number().int(),
  title: z.string().optional(),
  content: z.string().optional(),
  position: z.number().int().optional(),
  cardColor: z.enum(["lavender", "rose", "amber", "sage", "sky", "slate"]).optional(),
  synopsis: z.string().optional(),
});

export type Chapter = typeof chapters.$inferSelect;
export type InsertChapter = z.infer<typeof insertChapterSchema>;
