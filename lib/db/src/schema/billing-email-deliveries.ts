import { integer, pgTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const billingEmailDeliveries = pgTable("billing_email_deliveries", {
  accountId: varchar("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessKey: text("access_key").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  status: text("status", { enum: ["sending", "pending", "sent"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  providerEmailId: text("provider_email_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, table => [
  primaryKey({ columns: [table.accountId, table.accessKey] }),
]);

export const insertBillingEmailDeliverySchema = z.object({
  accountId: z.string().min(1),
  accessKey: z.string().min(1),
  recipientEmail: z.string().email(),
});

export type InsertBillingEmailDelivery = z.infer<typeof insertBillingEmailDeliverySchema>;
export type BillingEmailDelivery = typeof billingEmailDeliveries.$inferSelect;
