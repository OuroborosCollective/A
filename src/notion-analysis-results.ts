import { assertAllowedNotionTarget, NOTION_TARGETS } from "./consent.js"
import type { AnalysisTask } from "./domain/types.js"

const NOTION_VERSION = "2025-09-03"
const MIN_REQUEST_INTERVAL_MS = 350
const MAX_RETRIES = 5

type Json = Record<string, unknown>

export interface PublishableAnalysisResult {
  taskId: string
  executor: "research" | "wolfram"
  status: "done" | "blocked"
  resultSummary: string
  method: string
  reproducibleInput: string
  evidenceRefs: string[]
  resultSha256: string
  completedAt: string
}

export interface AnalysisPublicationInput {
  result: PublishableAnalysisResult
  task: AnalysisTask
}

interface NotionListResponse {
  results?: Array<{ id: string }>
}

let nextRequestAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForNotionSlot(): Promise<void> {
  const waitMs = Math.max(0, nextRequestAt - Date.now())
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

function headers(token: string): HeadersInit {
  if (!token.trim()) throw new Error("NOTION_API_TOKEN is missing")
  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  }
}

async function notionRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await waitForNotionSlot()
    const response = await fetch(`https://api.notion.com${path}`, {
      ...init,
      headers: { ...headers(token), ...(init.headers ?? {}) },
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

function select(name: string): Json {
  return { select: { name } }
}

function checkbox(value: boolean): Json {
  return { checkbox: value }
}

function date(value: string): Json {
  return { date: { start: value } }
}

function plainTextProperty(page: any, property: string): string {
  const prop = page?.properties?.[property]
  const items = Array.isArray(prop?.rich_text) ? prop.rich_text : Array.isArray(prop?.title) ? prop.title : []
  return items.map((item: any) => item?.plain_text ?? item?.text?.content ?? "").join("")
}

function checkboxProperty(page: any, property: string): boolean {
  return page?.properties?.[property]?.checkbox === true
}

function resultId(result: PublishableAnalysisResult): string {
  return `analysis-result:${result.resultSha256}`
}

function shortMarker(value: string): string {
  return (value.match(/[a-f0-9]{12,}/i)?.[0] ?? value).slice(0, 12)
}

export function analysisTruthBoundary(task: AnalysisTask): string {
  if (task.requiresHumanReview || task.kind === "stylometry") {
    return "Abgeleiteter Analysebefund, keine Primärevidenz. Identitäts- oder Autorschaftsschlüsse benötigen menschliche Prüfung und dürfen nicht automatisch finalisiert werden."
  }
  if (task.kind === "cryptographic-statistics") {
    return "Abgeleiteter kryptografischer/statistischer Befund, keine Primärevidenz und kein Identitätsbeweis. Keine Private-Key-Recovery oder Ableitung geheimer Schlüssel."
  }
  return "Abgeleiteter reproduzierbarer Analysebefund, keine Primärevidenz. Der Befund gilt nur für die angegebenen Daten, Methode und Evidenzreferenzen und begründet keine reale Satoshi-Identität."
}

export function analysisResultProperties(input: AnalysisPublicationInput, readbackVerified: boolean): Json {
  const { result, task } = input
  const executor = result.executor === "wolfram" ? "Wolfram" : "Research"
  const status = result.status === "done" ? "Done" : "Blocked"
  return {
    Name: title(`[${shortMarker(task.sourceCanonicalId)}] ${task.kind}`),
    "Result-ID": richText(resultId(result)),
    "Task-ID": richText(result.taskId),
    "Quellen-ID": richText(task.sourceCanonicalId),
    Executor: select(executor),
    Analysetyp: select(task.kind),
    Status: select(status),
    Ergebnis: richText(result.resultSummary),
    Methode: richText(result.method),
    "Reproduzierbare Eingabe": richText(result.reproducibleInput),
    "Evidence-Refs": richText(result.evidenceRefs.join("\n")),
    "Result SHA-256": richText(result.resultSha256),
    "Abgeschlossen am": date(result.completedAt),
    "Readback geprüft": checkbox(readbackVerified),
    "Human Review nötig": checkbox(task.requiresHumanReview),
    Wahrheitsgrenze: richText(analysisTruthBoundary(task)),
    "Zusätzliche Einwilligung nötig": checkbox(task.requiresHumanReview),
  }
}

async function findByTaskId(token: string, taskId: string): Promise<string | null> {
  const target = NOTION_TARGETS.analysisResults
  assertAllowedNotionTarget(target)
  const response = await notionRequest<NotionListResponse>(token, `/v1/data_sources/${target}/query`, {
    method: "POST",
    body: JSON.stringify({ filter: { property: "Task-ID", rich_text: { equals: taskId } }, page_size: 1 }),
  })
  return response.results?.[0]?.id ?? null
}

async function createPage(token: string, properties: Json): Promise<string> {
  const target = NOTION_TARGETS.analysisResults
  assertAllowedNotionTarget(target)
  const created = await notionRequest<{ id: string }>(token, "/v1/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: target }, properties }),
  })
  return created.id
}

async function updatePage(token: string, pageId: string, properties: Json): Promise<void> {
  await notionRequest(token, `/v1/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })
}

export async function upsertAnalysisResultToNotion(token: string, input: AnalysisPublicationInput): Promise<string> {
  const { result } = input
  const existing = await findByTaskId(token, result.taskId)
  const initial = analysisResultProperties(input, false)
  const pageId = existing ?? (await createPage(token, initial))
  if (existing) await updatePage(token, pageId, initial)

  const firstReadback = await notionRequest<any>(token, `/v1/pages/${pageId}`)
  if (plainTextProperty(firstReadback, "Task-ID") !== result.taskId) {
    throw new Error(`Notion analysis readback task mismatch: ${result.taskId}`)
  }
  if (plainTextProperty(firstReadback, "Result SHA-256") !== result.resultSha256) {
    throw new Error(`Notion analysis readback hash mismatch: ${result.taskId}`)
  }

  await updatePage(token, pageId, { "Readback geprüft": checkbox(true) })
  const finalReadback = await notionRequest<any>(token, `/v1/pages/${pageId}`)
  if (plainTextProperty(finalReadback, "Task-ID") !== result.taskId) {
    throw new Error(`Notion analysis final readback task mismatch: ${result.taskId}`)
  }
  if (plainTextProperty(finalReadback, "Result SHA-256") !== result.resultSha256) {
    throw new Error(`Notion analysis final readback hash mismatch: ${result.taskId}`)
  }
  if (!checkboxProperty(finalReadback, "Readback geprüft")) {
    throw new Error(`Notion analysis final readback flag missing: ${result.taskId}`)
  }
  return pageId
}
