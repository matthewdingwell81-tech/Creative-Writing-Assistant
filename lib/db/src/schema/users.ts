import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  firebaseUid: varchar("firebase_uid", { length: 128 }),
  password: text("password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("users_firebase_uid_unique").on(table.firebaseUid).where(sql`${table.firebaseUid} IS NOT NULL`),
]);

export const insertUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
