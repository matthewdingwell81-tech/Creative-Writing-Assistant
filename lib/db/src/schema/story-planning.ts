import { pgTable, serial, integer, text, timestamp, type AnyPgColumn, index } from "drizzle-orm/pg-core";
import { z } from "zod";
import { documents } from "./documents";
import { chapters } from "./chapters";

export const storyPlanning = pgTable("story_planning", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  role: text("role").notNull().default(""),
  motivations: text("motivations").notNull().default(""),
  traits: text("traits").notNull().default(""),
  arc: text("arc").notNull().default(""),
  category: text("category").notNull().default(""),
  timeLabel: text("time_label").notNull().default(""),
  position: integer("position").notNull().default(0),
  chapterId: integer("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  characterId: integer("character_id").references((): AnyPgColumn => storyPlanning.id, { onDelete: "set null" }),
  relatedCharacterId: integer("related_character_id").references((): AnyPgColumn => storyPlanning.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("story_planning_document_idx").on(table.documentId)]);

export const planningKindSchema = z.enum(["character", "relationship", "timeline", "worldbuilding", "note"]);
const optionalText = z.string().max(20000).optional();
export const planningInputSchema = z.object({
  kind: planningKindSchema,
  title: z.string().trim().min(1).max(200),
  content: optionalText,
  role: z.string().max(200).optional(),
  motivations: optionalText,
  traits: optionalText,
  arc: optionalText,
  category: z.string().trim().max(100).optional(),
  timeLabel: z.string().trim().max(200).optional(),
  chapterId: z.number().int().positive().nullable().optional(),
  characterId: z.number().int().positive().nullable().optional(),
  relatedCharacterId: z.number().int().positive().nullable().optional(),
}).strict();

export type PlanningInput = z.infer<typeof planningInputSchema>;
export type StoryPlanning = typeof storyPlanning.$inferSelect;
