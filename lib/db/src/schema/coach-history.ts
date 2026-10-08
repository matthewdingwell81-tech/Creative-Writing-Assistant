import { pgTable, integer, varchar, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { users } from "./users";

export const coachHistory = pgTable("coach_history", {
  documentId: integer("document_id").primaryKey().references(() => documents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messages: jsonb("messages").$type<{ role: "user" | "assistant"; content: string }[]>().notNull().default([]),
  draft: text("draft").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
