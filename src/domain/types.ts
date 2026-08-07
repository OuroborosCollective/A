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
  | "Satoshi Forum"
  | "Forum Claims"

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

export type ClaimType =
  | "Identität"
  | "Technik"
  | "Chronologie"
  | "Autorschaft"
  | "Eigentum"
  | "Beziehung"
  | "Ort"
  | "Medienbehauptung"
  | "Sonstiges"

export interface ClaimCandidate {
  claimKey: string
  text: string
  claimType: ClaimType
  evidenceTier: "Behauptet"
  sourceCanonicalId: string
  sourceUrl: string
  sourcePublishedAt?: string
  primaryEvidenceAvailable: boolean
  confidence: number
  openQuestion: string
}

export type AnalysisKind =
  | "source-triangulation"
  | "temporal-analysis"
  | "cryptographic-statistics"
  | "network-graph"
  | "quantitative-analysis"
  | "stylometry"

export interface AnalysisTask {
  taskId: string
  sourceCanonicalId: string
  kind: AnalysisKind
  executor: "research" | "wolfram"
  status: "pending"
  requiresHumanReview: boolean
  rationale: string
  inputSummary: string
  sourceUrl: string
  createdAt: string
}

export interface FollowUpPlan {
  planKey: string
  title: string
  seedUrl: string
  seedType: "Forum" | "Primärdokument" | "Webarchiv" | "Code" | "Medien" | "Sammlung"
  priority: "A" | "B" | "C" | "D" | "E"
  status: "Offen"
  discoveryLogic: string
  distributionLogic: string
  truthRule: string
  paths: [string, string, string, string, string, string]
  createdAt: string
}
