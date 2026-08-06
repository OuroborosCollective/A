import type { EvidenceTier } from "./types.js"

export interface EvidenceInput {
  sourceType: string
  hasOriginal: boolean
  hasArchive: boolean
  recordHashVerified: boolean
  signatureVerified: boolean
  independentConfirmations: number
  contradictedByPrimaryEvidence: boolean
}

export function assessEvidence(input: EvidenceInput): {
  tier: EvidenceTier
  reasons: string[]
} {
  const reasons: string[] = []

  if (input.contradictedByPrimaryEvidence) {
    return {
      tier: "Widerlegt",
      reasons: ["Der Claim wird durch reproduzierbare Primärevidenz widersprochen."],
    }
  }

  if (input.signatureVerified && input.hasOriginal) {
    reasons.push("Original vorhanden und kryptografische Signatur verifiziert.")
    return { tier: "Primär belegt", reasons }
  }

  if (input.hasOriginal && input.recordHashVerified) {
    reasons.push("Original vorhanden und erfasster Datensatz-Hash reproduzierbar.")
    return { tier: "Primär belegt", reasons }
  }

  if (input.hasArchive && input.independentConfirmations >= 2) {
    reasons.push("Archivkopie und mindestens zwei unabhängige Bestätigungen vorhanden.")
    return { tier: "Unabhängig bestätigt", reasons }
  }

  if (input.hasArchive) {
    reasons.push("Unabhängige Archivkopie vorhanden; Originalinhalt noch nicht vollständig verifiziert.")
    return { tier: "Unabhängig archiviert", reasons }
  }

  if (input.independentConfirmations >= 2) {
    reasons.push("Mehrere unabhängige Sekundärquellen, aber keine Primärquelle.")
    return { tier: "Zeitgenössisch berichtet", reasons }
  }

  reasons.push(`Nur eine nicht primäre Quelle des Typs ${input.sourceType} verfügbar.`)
  return { tier: "Behauptet", reasons }
}

export function deriveResearchPaths(input: {
  title: string
  sourceType: string
  url: string
}): string[] {
  const host = new URL(input.url).hostname
  return [
    `Original und früheste Version von „${input.title}“ ermitteln`,
    `Archiv-Snapshots und Weiterleitungen für ${host} vergleichen`,
    `benannte Personen, Organisationen, Schlüssel und Konten extrahieren`,
    `Zeitstempel, Zeitzone und Veröffentlichungsreihenfolge prüfen`,
    `exakte Zitate und technische Claims in unabhängigen Quellen suchen`,
    `Gegenbelege und spätere Korrekturen zum Quellentyp ${input.sourceType} erfassen`,
  ]
}

export function calculateHype(input: {
  mentionCount: number
  independentPublishers: number
  searchTrend: number
  priceVolatility: number
  primaryEvidenceCount: number
}): { score: number; evidenceGap: boolean } {
  const mentions = clamp(input.mentionCount / 100, 0, 1)
  const publishers = clamp(input.independentPublishers / 20, 0, 1)
  const search = clamp(input.searchTrend / 100, 0, 1)
  const volatility = clamp(input.priceVolatility / 20, 0, 1)
  const primary = clamp(input.primaryEvidenceCount / 5, 0, 1)

  const score = Math.round(
    100 * (0.35 * mentions + 0.25 * publishers + 0.2 * search + 0.15 * volatility + 0.05 * primary)
  )
  return {
    score,
    evidenceGap: score >= 60 && input.primaryEvidenceCount === 0,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
