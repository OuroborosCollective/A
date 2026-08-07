import type {
  AnalysisTask,
  ClaimCandidate,
  ClaimType,
  EvidenceTier,
  FollowUpPlan,
  ResearchSource,
} from "./types.js"

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

function compact(value: string, max = 700): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function claimType(text: string, source: ResearchSource): ClaimType {
  const lower = text.toLowerCase()
  if (/\b(i am satoshi|real satoshi|is satoshi|was satoshi|identity|creator of bitcoin|created bitcoin)\b/.test(lower)) return "Identität"
  if (/\b(author|authored|wrote|whitepaper|writing style|code author)\b/.test(lower)) return "Autorschaft"
  if (/\b(wallet|coins?|ownership|owns?|private key|address belongs|controlled)\b/.test(lower)) return "Eigentum"
  if (/\b(email|mailed|contacted|worked with|communicat|relationship|met with)\b/.test(lower)) return "Beziehung"
  if (/\b(timezone|time zone|location|country|city|ip address|geograph)\b/.test(lower)) return "Ort"
  if (/\b(19\d{2}|20\d{2}|before|after|when|date|time|last active|registered|timeline)\b/.test(lower)) return "Chronologie"
  if (/\b(block|hash|transaction|node|client|mining|difficulty|signature|pgp|gpg|dsa|ecdsa|nonce|rpc|protocol|key)\b/.test(lower)) return "Technik"
  if (source.lane === "Forum Claims") return "Medienbehauptung"
  return "Sonstiges"
}

function sentenceCandidates(text: string): string[] {
  const normalized = text
    .replace(/^Autor-Konto:[\s\S]*?Inhalt:\s*/i, "")
    .replace(/^Forumbehauptung[\s\S]*?Inhalt:\s*/i, "")
    .replace(/https?:\/\/\S+/g, " ")
  const sentences = normalized
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => compact(sentence, 500))
    .filter((sentence) => sentence.length >= 35 && sentence.split(/\s+/).length >= 7)
    .filter((sentence) => !/^(quote|re:|thanks|thank you)\b/i.test(sentence))
  return [...new Set(sentences)].slice(0, 3)
}

export function extractClaimCandidates(source: ResearchSource): ClaimCandidate[] {
  if (source.lane !== "Satoshi Forum" && source.lane !== "Forum Claims") return []
  return sentenceCandidates(source.summary).map((text, index) => ({
    claimKey: `${source.canonicalId}:claim:${index + 1}`,
    text,
    claimType: claimType(text, source),
    evidenceTier: "Behauptet",
    sourceCanonicalId: source.canonicalId,
    sourceUrl: source.originalUrl,
    sourcePublishedAt: source.publishedAt,
    primaryEvidenceAvailable: source.primarySource,
    confidence: source.lane === "Satoshi Forum" ? 0.45 : 0.2,
    openQuestion: "Kann diese Aussage durch unabhängige Primärquellen, zeitgenössische Archive oder reproduzierbare technische Evidenz bestätigt oder widerlegt werden?",
  }))
}

export function deriveAnalysisTasks(source: ResearchSource, claims: ClaimCandidate[]): AnalysisTask[] {
  const text = `${source.title}\n${source.summary}\n${claims.map((claim) => claim.text).join("\n")}`.toLowerCase()
  const createdAt = source.retrievedAt
  const tasks: AnalysisTask[] = []
  const push = (kind: AnalysisTask["kind"], executor: AnalysisTask["executor"], rationale: string, requiresHumanReview = false) => {
    tasks.push({
      taskId: `${source.canonicalId}:analysis:${kind}`,
      sourceCanonicalId: source.canonicalId,
      kind,
      executor,
      status: "pending",
      requiresHumanReview,
      rationale,
      inputSummary: compact(source.summary, 1200),
      sourceUrl: source.originalUrl,
      createdAt,
    })
  }

  if (source.lane === "Satoshi Forum" || source.lane === "Forum Claims") {
    push("source-triangulation", "research", "Forumstatement gegen Original, Archivkopie, zitierte Quellen und Gegenbelege triangulieren.")
    push("temporal-analysis", "wolfram", "Zeitstempel, Posting-Abstände, Aktivitätsfenster und zeitliche Beziehungen quantitativ prüfen.")
  }
  if (/\b(pgp|gpg|dsa|ecdsa|signature|nonce|public key|private key|fingerprint|r-value|r value)\b/.test(text)) {
    push("cryptographic-statistics", "wolfram", "Kryptografische Parameter und Signaturdaten statistisch prüfen; keine Private-Key-Recovery versuchen.")
  }
  if (/\b(ip address|node|peer|network|address|connection|graph|irc)\b/.test(text)) {
    push("network-graph", "wolfram", "Öffentliche Beziehungen als Graph untersuchen; Netzwerkbezug ist kein physischer Standortbeweis.")
  }
  if (/\b(block|difficulty|hashrate|fee|fees|transaction|count|rate|probability|percent|version)\b/.test(text) || /\b\d+(?:\.\d+)?\b/.test(text)) {
    push("quantitative-analysis", "wolfram", "Numerische Aussagen, Verteilungen und technische Größen reproduzierbar nachrechnen.")
  }
  if (claims.some((claim) => claim.claimType === "Identität" || claim.claimType === "Autorschaft") || /\bwriting style|stylometry|authorship\b/.test(text)) {
    push("stylometry", "wolfram", "Nur Ähnlichkeits- und Stilmetriken berechnen; daraus niemals automatisch eine Satoshi-Identität ableiten.", true)
  }

  return [...new Map(tasks.map((task) => [task.taskId, task])).values()]
}

export function deriveFollowUpPlan(source: ResearchSource, claims: ClaimCandidate[], tasks: AnalysisTask[]): FollowUpPlan | null {
  const isForum = source.lane === "Satoshi Forum" || source.lane === "Forum Claims"
  const isDeepResearch = isForum || source.subjects.some((subject) => ["Satoshi", "Identität", "Kryptografie"].includes(subject))
  if (!isDeepResearch) return null
  const createdAt = source.retrievedAt

  const generic = deriveResearchPaths({ title: source.title, sourceType: source.sourceType, url: source.originalUrl })
  const forumPaths = isForum ? [
    `Exakten Bitcointalk-Post, Message-ID und früheste archivierte Fassung von „${source.title}“ sichern`,
    "Zitate und externe Links im Thread bis zu ihren ursprünglichen Quellen zurückverfolgen",
    "Aussagen mit zeitgleichen Bitcoin.org-, Mailinglisten-, SourceForge- und Bitcoin-Core-Quellen abgleichen",
    "Forumzeitstempel, mögliche Edits, Migration bitcoin.org/smf → bitcointalk.org und Reihenfolge historisieren",
    "Technische, kryptografische und Identitäts-Claims getrennt extrahieren und reproduzierbare Prüfungen definieren",
    "Gegenbelege, spätere Korrekturen, abweichende Erinnerungen und unabhängige Archivkopien suchen",
  ] : generic

  const paths = forumPaths.slice(0, 6) as [string, string, string, string, string, string]
  const taskSummary = tasks.length
    ? tasks.map((task) => `${task.executor}:${task.kind}${task.requiresHumanReview ? ":human-review" : ""}`).join(", ")
    : "research:source-triangulation"
  const claimSummary = claims.length
    ? claims.map((claim) => `[${claim.claimType}] ${compact(claim.text, 180)}`).join(" | ")
    : "Noch kein deterministischer Claim-Kandidat; Quelle dennoch als Recherche-Seed verfolgen."

  return {
    planKey: `${source.canonicalId}:follow-up`,
    title: `${isForum ? "Forumprüfung" : "Recherchepfad"}: ${compact(source.title, 180)}`,
    seedUrl: source.originalUrl,
    seedType: isForum ? "Forum" : source.sourceType.includes("Archiv") ? "Webarchiv" : source.sourceType.includes("Code") ? "Code" : "Primärdokument",
    priority: source.lane === "Satoshi Forum" ? "A" : source.lane === "Forum Claims" ? "B" : "C",
    status: "Offen",
    discoveryLogic: claimSummary,
    distributionLogic: `Analyse-Queue: ${taskSummary}`,
    truthRule: "Ein Forumbeitrag belegt zunächst nur, dass ein bestimmtes Konto diesen Text veröffentlichte. Sach- oder Identitätsclaims bleiben offen, bis unabhängige reproduzierbare Evidenz sie bestätigt oder widerlegt; Identität wird nie automatisch verifiziert.",
    paths,
    createdAt,
  }
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
