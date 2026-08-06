import type { Worker } from "@notionhq/workers"
import { j } from "@notionhq/workers/schema-builder"

import { canonicalSourceId, canonicalizeUrl } from "./domain/canonical.js"
import { assessEvidence, calculateHype, deriveResearchPaths } from "./domain/research.js"

export function registerResearchTools(worker: Worker): void {
  worker.tool("deriveResearchPaths", {
    title: "Recherchepfade ableiten",
    description: "Leitet sechs überprüfbare Folgesuchpfade aus einer Quelle ab.",
    schema: j.object({
      title: j.string().describe("Titel der Quelle"),
      sourceType: j.string().describe("Typ der Quelle"),
      url: j.string().describe("Original-URL"),
    }),
    outputSchema: j.object({ paths: j.array(j.string(), { minItems: 1 }) }),
    hints: { readOnlyHint: true },
    execute: (input) => ({ paths: deriveResearchPaths(input) }),
  })

  worker.tool("assessEvidence", {
    title: "Evidenz einstufen",
    description: "Stuft einen Claim deterministisch anhand expliziter Evidenzmerkmale ein.",
    schema: j.object({
      sourceType: j.string(),
      hasOriginal: j.boolean(),
      hasArchive: j.boolean(),
      recordHashVerified: j.boolean(),
      signatureVerified: j.boolean(),
      independentConfirmations: j.integer(),
      contradictedByPrimaryEvidence: j.boolean(),
    }),
    outputSchema: j.object({
      tier: j.string(),
      reasons: j.array(j.string(), { minItems: 1 }),
    }),
    hints: { readOnlyHint: true },
    execute: (input) => assessEvidence(input),
  })

  worker.tool("calculateHype", {
    title: "BTC-Hype berechnen",
    description: "Berechnet einen transparenten Hype-Wert und markiert Aufmerksamkeit ohne neue Primärevidenz.",
    schema: j.object({
      mentionCount: j.integer(),
      independentPublishers: j.integer(),
      searchTrend: j.number(),
      priceVolatility: j.number(),
      primaryEvidenceCount: j.integer(),
    }),
    outputSchema: j.object({ score: j.integer(), evidenceGap: j.boolean() }),
    hints: { readOnlyHint: true },
    execute: (input) => calculateHype(input),
  })

  worker.tool("canonicalSourceId", {
    title: "Kanonische Quellen-ID erzeugen",
    description: "Normalisiert eine URL und erzeugt eine deterministische Quellen-ID.",
    schema: j.object({
      adapter: j.string(),
      upstreamId: j.string(),
      url: j.string(),
    }),
    outputSchema: j.object({ canonicalUrl: j.string(), canonicalId: j.string() }),
    hints: { readOnlyHint: true },
    execute: async ({ adapter, upstreamId, url }) => ({
      canonicalUrl: canonicalizeUrl(url),
      canonicalId: await canonicalSourceId(adapter, upstreamId, url),
    }),
  })
}
