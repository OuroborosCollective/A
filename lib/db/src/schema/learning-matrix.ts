import { pgTable, serial, jsonb, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const learningMatrix = pgTable("learning_matrix", {
  id: serial("id").primaryKey(),
  repoIdentifier: varchar("repo_identifier", { length: 255 }).notNull().unique(), // e.g. "owner/repo"
  language: varchar("language", { length: 50 }),
  structureType: varchar("structure_type", { length: 50 }), // e.g. "monorepo", "flat", "src-driven"
  renderingEngine: varchar("rendering_engine", { length: 50 }),
  gameGenre: varchar("game_genre", { length: 50 }),
  analysisResult: jsonb("analysis_result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertLearningMatrixSchema = createInsertSchema(learningMatrix).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LearningMatrix = typeof learningMatrix.$inferSelect;
export type InsertLearningMatrix = z.infer<typeof insertLearningMatrixSchema>;
