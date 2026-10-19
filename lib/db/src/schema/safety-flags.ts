import { pgTable, serial, varchar, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export type SafetyFlagPhase = {
  phase: "input" | "output";
  category: string;
  reason: string;
};

export const safetyFlags = pgTable("safety_flags", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feature: varchar("feature", { length: 32 }).notNull(),
  phases: jsonb("phases").$type<SafetyFlagPhase[]>().notNull(),
  requestContext: text("request_context"),
  generatedContent: text("generated_content"),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewerNote: text("reviewer_note"),
});
