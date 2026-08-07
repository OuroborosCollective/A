import { assertAllowedNotionTarget, NOTION_TARGETS } from "./consent.js"
import type { HypeSignal, ResearchSource } from "./domain/types.js"

const DEFAULT_NOTION_VERSION = "2025-09-03"
const MIN_REQUEST_INTERVAL_MS = 350
const MAX_RETRIES = 5

type Json = Record<string, unknown>

interface NotionListResponse {
  results?: Array<{ id: string }>
}

let nextRequestAt = 0

function headers(token: string, version = DEFAULT_NOTION_VERSION): HeadersInit {
  if (!token.trim()) throw new Error("NOTION_API_TOKEN is missing")
  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
    "Notion-Version": version,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForNotionSlot(): Promise<void> {
  const now = Date.now()
  const waitMs = Math.max(0, nextRequestAt - now)
  if (waitMs) await sleep(waitMs)
  nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after")?.trim()
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(MIN_REQUEST_INTERVAL_MS, seconds * 1000)
    const at = Date.parse(retryAfter)
    if (!Number.isNaN(at)) return Math.max(MIN_REQUEST_INTERVAL_MS, at - Date.now())
  }
  return Math.min(8_000, 500 * 2 ** attempt)
}

async function notionRequest<T>(token: string, path: string, init: RequestInit = {}, version?: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await waitForNotionSlot()
    const response = await fetch(`https://api.notion.com${path}`, {
      ...init,
      headers: { ...headers(token, version), ...(init.headers ?? {}) },
    })
    if (response.ok) return (await response.json()) as T

    const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504
    if (retryable && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(response, attempt))
      continue
    }

    const body = await response.text()
    throw new Error(`Notion API ${response.status} ${path}: ${body.slice(0, 500)}`)
  }
  throw new Error(`Notion API retry budget exhausted: ${path}`)
}

function richText(value: string): Json {
  return { rich_text: value ? [{ type: "text", text: { content: value.slice(0, 1900) } }] : [] }
}

function title(value: string): Json {
  return { title: [{ type: "text", text: { content: value.slice(0, 1900) } }] }
}

function date(value?: string): Json {
  return { date: value ? { start: value } : null }
}

function select(name: string): Json {
  return { select: { name } }
}

function checkbox(value: boolean): Json {
  return { checkbox: value }
}

function url(value?: string): Json {
  return { url: value || null }
}

function multiSelect(values: string[]): Json {
  return { multi_select: values.map((name) => ({ name })) }
}

async function findByRichText(token: string, dataSourceId: string, property: string, value: string): Promise<string | null> {
  assertAllowedNotionTarget(dataSourceId)
  const body = {
    filter: { property, rich_text: { equals: value } },
    page_size: 1,
  }
  const result = await notionRequest<NotionListResponse>(token, `/v1/data_sources/${dataSourceId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  })
  return result.results?.[0]?.id ?? null
}

async function createPage(token: string, dataSourceId: string, properties: Json): Promise<string> {
  assertAllowedNotionTarget(dataSourceId)
  const created = await notionRequest<{ id: string }>(token, "/v1/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: dataSourceId }, properties }),
  })
  return created.id
}

async function updatePage(token: string, pageId: string, properties: Json): Promise<void> {
  await notionRequest(token, `/v1/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })
}

function plainRichText(page: any, property: string): string {
  const items = page?.properties?.[property]?.rich_text
  if (!Array.isArray(items)) return ""
  return items.map((item: any) => item?.plain_text ?? item?.text?.content ?? "").join("")
}

function sourceType(source: ResearchSource): string {
  if (source.sourceType === "Code-Commit" || source.sourceType === "Software-Release") return "Code oder Repository"
  if (source.sourceType === "Webarchiv-Capture") return "Website"
  return source.primarySource ? "Primärquelle" : "Sonstiges"
}

function sourceProperties(source: ResearchSource, readbackVerified: boolean): Json {
  const allowedTags = new Set(["Satoshi", "Bitcoin", "Cypherpunk", "Kryptografie", "Identität", "Historie", "Technik", "Medien", "Recht"])
  return {
    Name: title(source.title),
    "Kanonische ID": richText(source.canonicalId),
    Typ: select(sourceType(source)),
    Evidenzstufe: select(source.evidenceTier),
    "Original-URL": url(source.originalUrl),
    "Archiv-URL": url(source.archiveUrl),
    Veröffentlicht: date(source.publishedAt),
    "Erfasst am": date(source.retrievedAt),
    "Zuletzt geprüft": date(source.retrievedAt),
    "Upstream-ID": richText(source.upstreamId),
    "Inhalts-Hash": richText(source.recordSha256),
    Adapter: richText(source.adapter),
    Prüfstatus: select("In Prüfung"),
    Tags: multiSelect(source.subjects.filter((tag) => allowedTags.has(tag))),
    Kernaussage: richText(source.summary),
    Privatquelle: checkbox(false),
    "Zusätzliche Einwilligung nötig": checkbox(false),
    "Readback geprüft": checkbox(readbackVerified),
  }
}

export async function upsertSourceToNotion(token: string, source: ResearchSource): Promise<string> {
  const target = NOTION_TARGETS.sources
  const existing = await findByRichText(token, target, "Kanonische ID", source.canonicalId)
  const initial = sourceProperties(source, false)
  const pageId = existing ?? (await createPage(token, target, initial))
  if (existing) await updatePage(token, pageId, initial)

  const readback = await notionRequest<any>(token, `/v1/pages/${pageId}`)
  if (plainRichText(readback, "Kanonische ID") !== source.canonicalId) throw new Error(`Notion readback canonical ID mismatch: ${source.canonicalId}`)
  if (plainRichText(readback, "Inhalts-Hash") !== source.recordSha256) throw new Error(`Notion readback hash mismatch: ${source.canonicalId}`)
  await updatePage(token, pageId, { "Readback geprüft": checkbox(true) })
  return pageId
}

function signalProperties(signal: HypeSignal, readbackVerified: boolean): Json {
  return {
    Name: title(signal.title),
    "Signal-ID": richText(signal.signalId),
    Quelle: richText(signal.source),
    "Quell-URL": url(signal.sourceUrl),
    Veröffentlicht: date(signal.publishedAt),
    "Erfasst am": date(signal.retrievedAt),
    Zusammenfassung: richText(signal.summary),
    Keywords: multiSelect(signal.keywords),
    "Hype-Score": { number: signal.hypeScore },
    "Primärevidenz-Anzahl": { number: signal.primaryEvidenceCount },
    "Evidence Gap": checkbox(signal.evidenceGap),
    "Record SHA-256": richText(signal.recordSha256),
    Adapter: richText(signal.adapter),
    "Readback geprüft": checkbox(readbackVerified),
  }
}

export async function upsertSignalToNotion(token: string, signal: HypeSignal): Promise<string> {
  const target = NOTION_TARGETS.hype
  const existing = await findByRichText(token, target, "Signal-ID", signal.signalId)
  const initial = signalProperties(signal, false)
  const pageId = existing ?? (await createPage(token, target, initial))
  if (existing) await updatePage(token, pageId, initial)

  const readback = await notionRequest<any>(token, `/v1/pages/${pageId}`)
  if (plainRichText(readback, "Signal-ID") !== signal.signalId) throw new Error(`Notion readback signal ID mismatch: ${signal.signalId}`)
  if (plainRichText(readback, "Record SHA-256") !== signal.recordSha256) throw new Error(`Notion readback signal hash mismatch: ${signal.signalId}`)
  await updatePage(token, pageId, { "Readback geprüft": checkbox(true) })
  return pageId
}
