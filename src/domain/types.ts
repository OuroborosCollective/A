export type EvidenceTier =
  | "Primär belegt"
  | "Unabhängig archiviert"
  | "Unabhängig bestätigt"
  | "Zeitgenössisch berichtet"
  | "Behauptet"
  | "Spekulativ"
  | "Widerlegt"
  | "Unprüfbar"

export type SourceLane =
  | "Bitcoin Core"
  | "Historische Webarchive"
  | "Technische Berichte"
  | "Medien und Hype"

export interface ResearchSource {
  canonicalId: string
  title: string
  lane: SourceLane
  sourceType: string
  evidenceTier: EvidenceTier
  originalUrl: string
  archiveUrl?: string
  publishedAt?: string
  retrievedAt: string
  upstreamId: string
  upstreamDigest?: string
  recordSha256: string
  contentHashVerified: boolean
  adapter: string
  status: "Erfasst" | "In Prüfung" | "Blockiert"
  subjects: string[]
  summary: string
  primarySource: boolean
  independentConfirmations: number
}

export interface HypeSignal {
  signalId: string
  title: string
  source: string
  sourceUrl: string
  publishedAt?: string
  retrievedAt: string
  summary: string
  keywords: string[]
  hypeScore: number
  primaryEvidenceCount: number
  evidenceGap: boolean
  recordSha256: string
  adapter: string
}
