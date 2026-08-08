import { fetchCryptographyMail } from "./adapters/cryptography-mailing-list.js"
import { CRYPTOGRAPHY_MAILING_LIST_SEEDS } from "./config.js"
import { canonicalSourceId } from "./domain/canonical.js"
import { sha256Hex, stableJson } from "./domain/hash.js"
import type { AnalysisTask, ClaimCandidate, FollowUpPlan, ResearchSource } from "./domain/types.js"
import { NOTION_TARGETS } from "./consent.js"
import { isAuthorized } from "./auth.js"
import { upsertClaimToNotion, upsertFollowUpPlanToNotion, upsertSourceToNotion } from "./notion-api.js"
import {
  addReceipt,
  getRecordMeta,
  getState,
  hasSuccessfulReceipt,
  putState,
  queueAnalysisTask,
  rememberRecord,
} from "./storage.js"
import { handleFetch as baseHandleFetch, scheduled as baseScheduled, type Env, type ScheduledLike } from "./runtime.js"

const LANE = "mailinglist"
const DISCOVERY_CRON = "17 */6 * * *"

interface MailingListState { seedIndex?: number }
interface HistoricalExtensionState { slot?: number }

function mode(env: Env): "preview" | "live" {
  return env.AUTONOMY_MODE === "live" ? "live" : "preview"
}

function requireNotionToken(env: Env): string {
  const token = env.NOTION_API_TOKEN?.trim()
  if (!token) throw new Error("AUTONOMY_MODE=live requires NOTION_API_TOKEN")
  return token
}

function compact(value: string, max = 1400): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function claimType(text: string): ClaimCandidate["claimType"] {
  const lower = text.toLowerCase()
  if (/\b(identity|real satoshi|is satoshi|creator of bitcoin)\b/.test(lower)) return "Identität"
  if (/\b(author|authored|wrote|whitepaper|source code)\b/.test(lower)) return "Autorschaft"
  if (/\b(time|date|before|after|2008|2009|2010)\b/.test(lower)) return "Chronologie"
  if (/\b(block|hash|transaction|node|client|mining|difficulty|signature|key|proof-of-work|network|fee|coin|version|release)\b/.test(lower)) return "Technik"
  return "Sonstiges"
}

function claimsFor(source: ResearchSource, body: string): ClaimCandidate[] {
  const sentences = body
    .replace(/https?:\/\/\S+/g, " ")
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => compact(sentence, 500))
    .filter((sentence) => sentence.length >= 40 && sentence.split(/\s+/).length >= 7)
    .filter((sentence) => !/^(thanks|thank you|re:)\b/i.test(sentence))
  return [...new Set(sentences)].slice(0, 3).map((text, index) => ({
    claimKey: `${source.canonicalId}:claim:${index + 1}`,
    text,
    claimType: claimType(text),
    evidenceTier: "Behauptet",
    sourceCanonicalId: source.canonicalId,
    sourceUrl: source.originalUrl,
    sourcePublishedAt: source.publishedAt,
    primaryEvidenceAvailable: true,
    confidence: 0.5,
    openQuestion: "Ist diese Aussage durch Whitepaper, Code/Release-Artefakte, zeitgenössische Korrespondenz, unabhängige Archive oder reproduzierbare technische Evidenz bestätigbar oder widerlegbar?",
  }))
}

function tasksFor(source: ResearchSource, claims: ClaimCandidate[]): AnalysisTask[] {
  const text = `${source.title}\n${source.summary}\n${claims.map((claim) => claim.text).join("\n")}`.toLowerCase()
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
      createdAt: source.retrievedAt,
    })
  }
  push("source-triangulation", "research", "Mailinglisten-Nachricht gegen Thread-Kontext, Whitepaper, Bitcoin.org, SourceForge, Bitcointalk, Code und unabhängige Archivkopien triangulieren.")
  push("temporal-analysis", "wolfram", "Mail-Zeitstempel, Reihenfolge im Thread, Antwortabstände und zeitliche Beziehungen reproduzierbar analysieren.")
  if (/\b(pgp|gpg|dsa|ecdsa|signature|nonce|public key|fingerprint|hashcash|hash|proof-of-work)\b/.test(text)) {
    push("cryptographic-statistics", "wolfram", "Kryptografische und Proof-of-Work-bezogene Aussagen quantitativ prüfen; keine Private-Key-Recovery durchführen.")
  }
  if (/\b(node|network|peer|bandwidth|transaction|block|difficulty|fee|fees|cpu|bytes?|kb|mb|gb|million|billion|percent|rate)\b/.test(text) || /\b\d+(?:\.\d+)?\b/.test(text)) {
    push("quantitative-analysis", "wolfram", "Numerische Größen, Bandbreite, Raten, Difficulty, Emission und andere technische Angaben nachrechnen.")
  }
  if (/\b(identity|authorship|writing style|stylometry)\b/.test(text)) {
    push("stylometry", "wolfram", "Nur Stil-/Ähnlichkeitsmetriken berechnen; niemals automatisch eine Satoshi-Identität ableiten.", true)
  }
  return [...new Map(tasks.map((task) => [task.taskId, task])).values()]
}

function followUpFor(source: ResearchSource, tasks: AnalysisTask[]): FollowUpPlan {
  return {
    planKey: `${source.canonicalId}:follow-up`,
    title: `Mailinglisten-Prüfung: ${source.title}`,
    seedUrl: source.originalUrl,
    seedType: "Primärdokument",
    priority: "A",
    status: "Offen",
    discoveryLogic: "Originale MetzDowd-Nachricht als zeitgenössischen Primärrecord sichern, ihren Thread-Kontext rekonstruieren und jede technische Aussage auf unabhängige Primär- oder Archivquellen zurückführen.",
    distributionLogic: `Analyse-Queue: ${tasks.map((task) => `${task.executor}:${task.kind}`).join(", ") || "research:source-triangulation"}`,
    truthRule: "Die originale Mailinglisten-Archivseite belegt, dass das Archiv diese Nachricht mit Absender, Datum und Inhalt führt. Sie ist kein kryptografischer Identitätsbeweis für die reale Person hinter dem Absender und macht technische oder biografische Aussagen nicht automatisch wahr.",
    paths: [
      `Exakte MetzDowd-Nachricht „${source.title}", Message-Nummer, Absender, Datum, Betreff und Inhalts-Hash sichern`,
      "Vorherige/nachfolgende Thread-Nachrichten und zitierten Text rekonstruieren; eigene Aussagen strikt von Zitaten anderer Teilnehmer trennen",
      "Alle verlinkten Originale wie Whitepaper, Bitcoin.org oder Release-/Code-URLs über Wayback und Common Crawl bis zur frühesten Fassung zurückverfolgen",
      "Technische Aussagen mit Whitepaper, SourceForge, frühem Bitcoin-Code, Bitcointalk und späteren Bitcoin-Core-Artefakten vergleichen",
      "Kryptografische und quantitative Aussagen in reproduzierbare Prüfaufträge zerlegen; öffentliche Schlüssel/Signaturen nur auf Kontinuität prüfen und niemals Private-Key-Recovery versuchen",
      "Widersprüche, Korrekturen, Antworten anderer Listenteilnehmer, alternative Archivkopien sowie Zeitstempel-/Zeitzonen-/Header-Anomalien als neue Recherche-Seeds erfassen",
    ],
    createdAt: source.retrievedAt,
  }
}

async function sourceFor(seedIndex: number): Promise<{ source: ResearchSource; body: string; hasMore: boolean; nextIndex: number }> {
  const seed = CRYPTOGRAPHY_MAILING_LIST_SEEDS[seedIndex]
  if (!seed) throw new Error(`Cryptography mailing-list seed index out of range: ${seedIndex}`)
  const message = await fetchCryptographyMail(seed)
  const retrievedAt = new Date().toISOString()
  const source: ResearchSource = {
    canonicalId: await canonicalSourceId("cryptography-mail", `${message.messageNumber}:${message.email}:${message.rawDate}`, message.archiveUrl),
    title: message.subject,
    lane: "Cryptography Mailing List",
    sourceType: "Mailinglisten-Nachricht",
    evidenceTier: "Primär belegt",
    originalUrl: message.archiveUrl,
    publishedAt: message.publishedAt,
    retrievedAt,
    upstreamId: `metzdowd:${message.messageNumber};from:${message.email}`,
    recordSha256: await sha256Hex(stableJson(message)),
    contentHashVerified: false,
    adapter: "MetzDowd Pipermail HTML",
    status: "In Prüfung",
    subjects: ["Satoshi", "Bitcoin", "Kryptografie", "Historie", "Technik"],
    summary: compact(`Zeitgenössische Cryptography-Mailinglisten-Nachricht. Archivierter Absender: ${message.author} <${message.email}>. Datum: ${message.rawDate}. Betreff: ${message.subject}. Eigener Nachrichtentext (Zitate anderer getrennt): ${message.body}`, 1850),
    primarySource: true,
    independentConfirmations: 0,
  }
  const nextIndex = seedIndex + 1 >= CRYPTOGRAPHY_MAILING_LIST_SEEDS.length ? 0 : seedIndex + 1
  return { source, body: message.body, hasMore: nextIndex !== 0, nextIndex }
}

async function queueTasks(env: Env, runId: string, tasks: AnalysisTask[]): Promise<void> {
  for (const task of tasks) {
    await queueAnalysisTask(env.DB, task)
    await addReceipt(env.DB, { runId, lane: LANE, action: "analysis-queued", canonicalId: task.taskId, target: "d1-analysis-queue", status: "success", details: `${task.executor}:${task.kind};human_review=${task.requiresHumanReview}` })
  }
}

async function persist(env: Env, runId: string, source: ResearchSource, body: string): Promise<void> {
  const currentMode = mode(env)
  const claims = claimsFor(source, body)
  const tasks = tasksFor(source, claims)
  const plan = followUpFor(source, tasks)
  const existing = await getRecordMeta(env.DB, source.canonicalId)
  await rememberRecord(env.DB, source.canonicalId, "source", source.recordSha256, source)

  if (currentMode === "preview") {
    await addReceipt(env.DB, { runId, lane: LANE, action: "notion-upsert", canonicalId: source.canonicalId, target: NOTION_TARGETS.sources, status: "preview" })
    for (const claim of claims) await addReceipt(env.DB, { runId, lane: LANE, action: "claim-candidate", canonicalId: claim.claimKey, target: NOTION_TARGETS.claims, status: "preview" })
    await addReceipt(env.DB, { runId, lane: LANE, action: "follow-up-plan", canonicalId: plan.planKey, target: NOTION_TARGETS.followups, status: "preview" })
    for (const task of tasks) await addReceipt(env.DB, { runId, lane: LANE, action: "analysis-queue", canonicalId: task.taskId, target: "d1-analysis-queue", status: "preview", details: `${task.executor}:${task.kind}` })
    return
  }

  const token = requireNotionToken(env)
  let pageId: string
  if (existing?.recordSha256 === source.recordSha256 && existing.notionPageId) {
    pageId = existing.notionPageId
    await addReceipt(env.DB, { runId, lane: LANE, action: "notion-source-reused", canonicalId: source.canonicalId, target: NOTION_TARGETS.sources, status: "success", details: `page=${pageId};unchanged_hash=true` })
  } else {
    pageId = await upsertSourceToNotion(token, source)
    await rememberRecord(env.DB, source.canonicalId, "source", source.recordSha256, source, pageId)
    await addReceipt(env.DB, { runId, lane: LANE, action: "notion-upsert-readback", canonicalId: source.canonicalId, target: NOTION_TARGETS.sources, status: "success", details: `page=${pageId}` })
  }

  if (await hasSuccessfulReceipt(env.DB, "follow-up-readback", plan.planKey)) {
    await queueTasks(env, runId, tasks)
    await addReceipt(env.DB, { runId, lane: LANE, action: "research-artifacts-reused", canonicalId: source.canonicalId, target: NOTION_TARGETS.followups, status: "success" })
    return
  }

  for (const claim of claims) {
    const claimPage = await upsertClaimToNotion(token, claim, pageId)
    await addReceipt(env.DB, { runId, lane: LANE, action: "claim-open-readback", canonicalId: claim.claimKey, target: NOTION_TARGETS.claims, status: "success", details: `page=${claimPage};status=Offen;evidence=Behauptet` })
  }
  const followUpPage = await upsertFollowUpPlanToNotion(token, plan)
  await addReceipt(env.DB, { runId, lane: LANE, action: "follow-up-readback", canonicalId: plan.planKey, target: NOTION_TARGETS.followups, status: "success", details: `page=${followUpPage};status=Offen` })
  await queueTasks(env, runId, tasks)
}

export async function runMailingListLane(env: Env): Promise<{ lane: string; mode: string; count: number; hasMore: boolean }> {
  const runId = crypto.randomUUID()
  const currentMode = mode(env)
  await addReceipt(env.DB, { runId, lane: LANE, action: "run-start", target: "cloudflare-worker", status: currentMode === "live" ? "success" : "preview", details: `revision=${env.REVISION ?? "unknown"}` })
  const state = await getState<MailingListState>(env.DB, LANE)
  const currentIndex = state?.seedIndex ?? 0
  const page = await sourceFor(currentIndex)
  await persist(env, runId, page.source, page.body)
  if (currentMode === "live") await putState(env.DB, LANE, { seedIndex: page.nextIndex })
  return { lane: LANE, mode: currentMode, count: 1, hasMore: page.hasMore }
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "POST" && url.pathname === "/run/mailinglist") {
    if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 })
    try { return Response.json(await runMailingListLane(env)) }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await addReceipt(env.DB, { runId: crypto.randomUUID(), lane: LANE, action: "run-failed", target: "cloudflare-worker", status: "failure", details: message.slice(0, 500) })
      return Response.json({ ok: false, error: "lane-failed", lane: LANE, message }, { status: 500 })
    }
  }
  return baseHandleFetch(request, env)
}

export async function scheduled(controller: ScheduledLike, env: Env): Promise<void> {
  if (controller.cron !== DISCOVERY_CRON) return baseScheduled(controller, env)

  const state = await getState<HistoricalExtensionState>(env.DB, "historical-extension")
  const slot = Math.max(0, Math.min(3, state?.slot ?? 0))
  if (slot === 3) await runMailingListLane(env)
  else await baseScheduled(controller, env)
  if (mode(env) === "live") await putState(env.DB, "historical-extension", { slot: (slot + 1) % 4 })
}

export type { Env, ScheduledLike }
