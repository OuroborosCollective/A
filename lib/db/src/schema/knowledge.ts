import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const knowledge = pgTable("knowledge", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // e.g., 'architecture', 'fusion_strategy', 'genre_pattern'
  subCategory: text("sub_category"), // e.g., 'platformer', 'three.js'
  key: text("key").notNull(), // e.g., repo identifier or pattern name
  content: jsonb("content").notNull(), // The learned data structure
  tags: text("tags").array(),
  confidence: integer("confidence").default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertKnowledgeSchema = createInsertSchema(knowledge).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Knowledge = typeof knowledge.$inferSelect;
export type InsertKnowledge = z.infer<typeof insertKnowledgeSchema>;
