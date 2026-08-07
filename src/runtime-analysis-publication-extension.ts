import { NOTION_TARGETS } from "./consent.js"
import type { AnalysisTask } from "./domain/types.js"
import { upsertAnalysisResultToNotion, type PublishableAnalysisResult } from "./notion-analysis-results.js"
import { addReceipt, type D1Database } from "./storage.js"
import {
  handleFetch as healthHandleFetch,
  scheduled as healthScheduled,
  type Env,
  type ScheduledLike,
} from "./runtime-analysis-health-extension.js"

const LANE = "analysis"

interface ResultRow {
  task_id: string
  executor: "research" | "wolfram"
  status: "done" | "blocked"
  result_summary: string
  method: string
  reproducible_input: string
  evidence_refs_json: string
  result_sha256: string
  completed_at: string
}

interface TaskRow {
  task_id: string
  payload_json: string
}

interface PublicationRow {
  task_id: string
  result_sha256: string
  notion_page_id: string
  notion_readback_at: string
}

export interface AnalysisPublicationRecord {
  taskId: string
  resultSha256: string
  notionPageId: string
  notionReadbackAt: string
  reused: boolean
}

function authorized(request: Request, env: Env): boolean {
  const configured = env.ADMIN_TOKEN?.trim()
  if (!configured) return false
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  return supplied === configured
}

function requireLiveNotionToken(env: Env): string {
  if (env.AUTONOMY_MODE !== "live") throw new Error("analysis publication is allowed only in live mode")
  const token = env.NOTION_API_TOKEN?.trim()
  if (!token) throw new Error("AUTONOMY_MODE=live requires NOTION_API_TOKEN")
  return token
}

async function parseSmallJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > 4096) throw new Error("analysis publication request exceeds 4096 bytes")
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object") throw new Error("body must be an object")
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof Error && error.message === "body must be an object") throw error
    throw new Error("analysis publication request must be valid JSON")
  }
}

function taskIdFrom(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("taskId must be a non-empty string")
  const taskId = value.trim()
  if (taskId.length > 500) throw new Error("taskId exceeds 500 characters")
  return taskId
}

function resultFromRow(row: ResultRow): PublishableAnalysisResult {
  let evidenceRefs: string[] = []
  try {
    const parsed = JSON.parse(row.evidence_refs_json)
    if (Array.isArray(parsed)) evidenceRefs = parsed.filter((item): item is string => typeof item === "string")
  } catch {
    evidenceRefs = []
  }
  return {
    taskId: row.task_id,
    executor: row.executor,
    status: row.status,
    resultSummary: row.result_summary,
    method: row.method,
    reproducibleInput: row.reproducible_input,
    evidenceRefs,
    resultSha256: row.result_sha256,
    completedAt: row.completed_at,
  }
}

async function getStoredResult(db: D1Database, taskId: string): Promise<ResultRow | null> {
  return db.prepare(
    "SELECT task_id, executor, status, result_summary, method, reproducible_input, evidence_refs_json, result_sha256, completed_at FROM analysis_results WHERE task_id = ?"
  ).bind(taskId).first<ResultRow>()
}

async function getStoredTask(db: D1Database, taskId: string): Promise<AnalysisTask | null> {
  const row = await db.prepare("SELECT task_id, payload_json FROM analysis_queue WHERE task_id = ?")
    .bind(taskId).first<TaskRow>()
  if (!row) return null
  try {
    return JSON.parse(row.payload_json) as AnalysisTask
  } catch {
    throw new Error(`analysis task payload is not valid JSON: ${taskId}`)
  }
}

async function getPublication(db: D1Database, taskId: string): Promise<PublicationRow | null> {
  return db.prepare(
    "SELECT task_id, result_sha256, notion_page_id, notion_readback_at FROM analysis_publications WHERE task_id = ?"
  ).bind(taskId).first<PublicationRow>()
}

function publicationRecord(row: PublicationRow, reused: boolean): AnalysisPublicationRecord {
  return {
    taskId: row.task_id,
    resultSha256: row.result_sha256,
    notionPageId: row.notion_page_id,
    notionReadbackAt: row.notion_readback_at,
    reused,
  }
}

export async function publishStoredAnalysisResult(env: Env, taskId: string): Promise<AnalysisPublicationRecord> {
  const token = requireLiveNotionToken(env)
  const resultRow = await getStoredResult(env.DB, taskId)
  if (!resultRow) throw new Error(`analysis result not found: ${taskId}`)
  const task = await getStoredTask(env.DB, taskId)
  if (!task) throw new Error(`analysis queue task not found: ${taskId}`)

  const existing = await getPublication(env.DB, taskId)
  if (existing) {
    if (existing.result_sha256 !== resultRow.result_sha256) {
      throw new Error(`analysis publication hash differs from immutable result: ${taskId}`)
    }
    return publicationRecord(existing, true)
  }

  const result = resultFromRow(resultRow)
  const pageId = await upsertAnalysisResultToNotion(token, { result, task })
  const readbackAt = new Date().toISOString()
  await env.DB.prepare(
    "INSERT OR IGNORE INTO analysis_publications(task_id, result_sha256, notion_page_id, notion_readback_at) VALUES(?, ?, ?, ?)"
  ).bind(taskId, result.resultSha256, pageId, readbackAt).run()

  const readback = await getPublication(env.DB, taskId)
  if (!readback) throw new Error(`analysis publication D1 readback missing: ${taskId}`)
  if (readback.result_sha256 !== result.resultSha256) throw new Error(`analysis publication D1 hash mismatch: ${taskId}`)
  if (readback.notion_page_id !== pageId) throw new Error(`analysis publication D1 page mismatch: ${taskId}`)

  await addReceipt(env.DB, {
    runId: crypto.randomUUID(),
    lane: LANE,
    action: "analysis-notion-readback",
    canonicalId: taskId,
    target: NOTION_TARGETS.analysisResults,
    status: "success",
    details: `page=${pageId};sha256=${result.resultSha256};readback_at=${readback.notion_readback_at}`,
  })
  return publicationRecord(readback, false)
}

async function healthWithPublicationReadiness(request: Request, env: Env): Promise<Response> {
  const base = await healthHandleFetch(request, env)
  if (!base.ok) return base
  const payload = await base.json() as Record<string, any>
  const row = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = 'analysis_publications'"
  ).first<{ name: string }>()
  return Response.json({
    ...payload,
    analysisResultRuntime: {
      ...(payload.analysisResultRuntime ?? {}),
      publications: row?.name === "analysis_publications",
    },
  })
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === "GET" && url.pathname === "/health") {
    return healthWithPublicationReadiness(request, env)
  }

  if (request.method === "POST" && url.pathname === "/analysis/publish") {
    if (!authorized(request, env)) return new Response("Unauthorized", { status: 401 })
    try {
      const body = await parseSmallJson(request)
      const publication = await publishStoredAnalysisResult(env, taskIdFrom(body.taskId))
      return Response.json(publication)
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 })
    }
  }

  if (request.method === "POST" && url.pathname === "/analysis/complete") {
    const completion = await healthHandleFetch(request, env)
    if (!completion.ok || env.AUTONOMY_MODE !== "live") return completion
    const result = await completion.json() as Record<string, unknown>
    const taskId = typeof result.taskId === "string" ? result.taskId : ""
    if (!taskId) return Response.json({ error: "analysis completion response is missing taskId" }, { status: 502 })
    try {
      const publication = await publishStoredAnalysisResult(env, taskId)
      return Response.json({ ...result, publication })
    } catch (error) {
      await addReceipt(env.DB, {
        runId: crypto.randomUUID(),
        lane: LANE,
        action: "analysis-notion-readback",
        canonicalId: taskId,
        target: NOTION_TARGETS.analysisResults,
        status: "failure",
        details: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      })
      return Response.json({
        error: `analysis result persisted but Notion publication failed: ${error instanceof Error ? error.message : String(error)}`,
        taskId,
        resultSha256: result.resultSha256 ?? null,
        publication: "pending",
      }, { status: 502 })
    }
  }

  return healthHandleFetch(request, env)
}

export async function scheduled(controller: ScheduledLike, env: Env): Promise<void> {
  await healthScheduled(controller, env)
}

export type { Env, ScheduledLike }
