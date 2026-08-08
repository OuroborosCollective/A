import { sha256Hex, stableJson } from "./domain/hash.js"
import type { AnalysisTask } from "./domain/types.js"
import { isAuthorized } from "./auth.js"
import { addReceipt, type D1Database } from "./storage.js"
import {
  handleFetch as feedHandleFetch,
  scheduled as feedScheduled,
  type Env,
  type ScheduledLike,
} from "./runtime-feed-budget-extension.js"

const LANE = "analysis"
const DEFAULT_LEASE_MINUTES = 15
const MAX_LEASE_MINUTES = 60
const MAX_BODY_BYTES = 32_768
const MAX_RESULT_CHARS = 8_000
const MAX_METHOD_CHARS = 4_000
const MAX_INPUT_CHARS = 8_000
const MAX_EVIDENCE_REFS = 20

export interface AnalysisClaim {
  taskId: string
  leaseId: string
  executor: "research" | "wolfram"
  claimedAt: string
  expiresAt: string
  task: AnalysisTask
}

export interface AnalysisCompletionInput {
  taskId: string
  leaseId: string
  executor: "research" | "wolfram"
  status: "done" | "blocked"
  resultSummary: string
  method: string
  reproducibleInput: string
  evidenceRefs: string[]
}

export interface AnalysisResultRecord extends AnalysisCompletionInput {
  resultSha256: string
  completedAt: string
}

interface QueueRow {
  task_id: string
  executor: "research" | "wolfram"
  status: "pending" | "running" | "done" | "blocked"
  requires_human_review: number
  payload_json: string
}

interface ClaimRow {
  task_id: string
  lease_id: string
  executor: "research" | "wolfram"
  claimed_at: string
  expires_at: string
}

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

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status })
}

function boundedText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`)
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} must not be empty`)
  if (trimmed.length > max) throw new Error(`${field} exceeds ${max} characters`)
  return trimmed
}

export function containsSecretMaterial(text: string): boolean {
  const lower = text.toLowerCase()
  return /-----begin [^-]*private key-----/i.test(text)
    || /\bxprv[1-9a-hj-np-z]{20,}\b/i.test(text)
    || /\b(?:seed phrase|mnemonic)\s*[:=]\s*(?:[a-z]+\s+){7,}[a-z]+\b/i.test(lower)
    || /\b(?:private key|privkey)\s*[:=]\s*[0-9a-f]{48,}\b/i.test(lower)
}

export function validateCompletionInput(value: unknown, requiresHumanReview = false): AnalysisCompletionInput {
  if (!value || typeof value !== "object") throw new Error("completion body must be an object")
  const body = value as Record<string, unknown>
  const taskId = boundedText(body.taskId, "taskId", 500)
  const leaseId = boundedText(body.leaseId, "leaseId", 200)
  const executor = body.executor
  if (executor !== "research" && executor !== "wolfram") throw new Error("executor must be research or wolfram")
  const status = body.status
  if (status !== "done" && status !== "blocked") throw new Error("status must be done or blocked")
  if (requiresHumanReview && status === "done") {
    throw new Error("human-review analysis tasks cannot be auto-finalized as done")
  }
  const resultSummary = boundedText(body.resultSummary, "resultSummary", MAX_RESULT_CHARS)
  const method = boundedText(body.method, "method", MAX_METHOD_CHARS)
  const reproducibleInput = boundedText(body.reproducibleInput, "reproducibleInput", MAX_INPUT_CHARS)
  if (!Array.isArray(body.evidenceRefs) || body.evidenceRefs.length > MAX_EVIDENCE_REFS) {
    throw new Error(`evidenceRefs must be an array with at most ${MAX_EVIDENCE_REFS} entries`)
  }
  const evidenceRefs = body.evidenceRefs.map((ref, index) => boundedText(ref, `evidenceRefs[${index}]`, 1_000))
  const secretCheck = [resultSummary, method, reproducibleInput, ...evidenceRefs].join("\n")
  if (containsSecretMaterial(secretCheck)) throw new Error("private-key, seed, or mnemonic material is forbidden in analysis results")
  return { taskId, leaseId, executor, status, resultSummary, method, reproducibleInput, evidenceRefs }
}

async function parseJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`)
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error("request body must be valid JSON")
  }
}

async function getTask(db: D1Database, taskId: string): Promise<QueueRow | null> {
  return db.prepare(
    "SELECT task_id, executor, status, requires_human_review, payload_json FROM analysis_queue WHERE task_id = ?"
  ).bind(taskId).first<QueueRow>()
}

async function getClaim(db: D1Database, taskId: string): Promise<ClaimRow | null> {
  return db.prepare(
    "SELECT task_id, lease_id, executor, claimed_at, expires_at FROM analysis_claims WHERE task_id = ?"
  ).bind(taskId).first<ClaimRow>()
}

function parseTask(row: QueueRow): AnalysisTask {
  return JSON.parse(row.payload_json) as AnalysisTask
}

async function expireStaleClaim(db: D1Database, task: QueueRow, now: string): Promise<void> {
  const claim = await getClaim(db, task.task_id)
  if (!claim || claim.expires_at > now) return
  await db.prepare("DELETE FROM analysis_claims WHERE task_id = ? AND expires_at <= ?").bind(task.task_id, now).run()
  if (task.status === "running") {
    await db.prepare("UPDATE analysis_queue SET status = 'pending', updated_at = ? WHERE task_id = ? AND status = 'running'")
      .bind(now, task.task_id).run()
  }
}

export async function claimAnalysisTask(
  db: D1Database,
  taskId: string,
  executor: "research" | "wolfram",
  leaseMinutes = DEFAULT_LEASE_MINUTES
): Promise<AnalysisClaim> {
  const task = await getTask(db, taskId)
  if (!task) throw new Error("analysis task not found")
  if (task.executor !== executor) throw new Error(`analysis task is assigned to ${task.executor}, not ${executor}`)
  if (task.status === "done" || task.status === "blocked") throw new Error(`analysis task is already ${task.status}`)

  const now = new Date().toISOString()
  await expireStaleClaim(db, task, now)
  const refreshed = await getTask(db, taskId)
  if (!refreshed) throw new Error("analysis task disappeared during claim")
  const active = await getClaim(db, taskId)
  if (active && active.expires_at > now) throw new Error("analysis task already has an active lease")

  const boundedLease = Math.max(1, Math.min(MAX_LEASE_MINUTES, Math.floor(leaseMinutes)))
  const leaseId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + boundedLease * 60_000).toISOString()
  await db.prepare(
    "INSERT OR IGNORE INTO analysis_claims(task_id, lease_id, executor, claimed_at, expires_at) VALUES(?, ?, ?, ?, ?)"
  ).bind(taskId, leaseId, executor, now, expiresAt).run()
  const readback = await getClaim(db, taskId)
  if (!readback || readback.lease_id !== leaseId) throw new Error("analysis task lease was claimed concurrently")

  await db.prepare(
    "UPDATE analysis_queue SET status = 'running', updated_at = ? WHERE task_id = ? AND status IN ('pending','running')"
  ).bind(now, taskId).run()
  const queueReadback = await getTask(db, taskId)
  if (queueReadback?.status !== "running") throw new Error("analysis task did not read back as running")
  return { taskId, leaseId, executor, claimedAt: now, expiresAt, task: parseTask(queueReadback) }
}

async function rowToResult(row: ResultRow): Promise<AnalysisResultRecord> {
  let evidenceRefs: string[] = []
  try {
    const parsed = JSON.parse(row.evidence_refs_json)
    if (Array.isArray(parsed)) evidenceRefs = parsed.filter((item): item is string => typeof item === "string")
  } catch {
    evidenceRefs = []
  }
  return {
    taskId: row.task_id,
    leaseId: "persisted",
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

export async function completeAnalysisTask(db: D1Database, rawInput: unknown): Promise<AnalysisResultRecord> {
  if (!rawInput || typeof rawInput !== "object") throw new Error("completion body must be an object")
  const taskId = boundedText((rawInput as Record<string, unknown>).taskId, "taskId", 500)
  const task = await getTask(db, taskId)
  if (!task) throw new Error("analysis task not found")
  const input = validateCompletionInput(rawInput, task.requires_human_review === 1)
  if (task.executor !== input.executor) throw new Error(`analysis task is assigned to ${task.executor}, not ${input.executor}`)
  if (task.status === "done" || task.status === "blocked") {
    const existing = await db.prepare(
      "SELECT task_id, executor, status, result_summary, method, reproducible_input, evidence_refs_json, result_sha256, completed_at FROM analysis_results WHERE task_id = ?"
    ).bind(taskId).first<ResultRow>()
    if (existing) return rowToResult(existing)
    throw new Error(`analysis task is already ${task.status} without a readable result`)
  }

  const now = new Date().toISOString()
  const claim = await getClaim(db, taskId)
  if (!claim || claim.lease_id !== input.leaseId || claim.executor !== input.executor) throw new Error("analysis completion requires the active matching lease")
  if (claim.expires_at <= now) throw new Error("analysis lease has expired")

  const resultSha256 = await sha256Hex(stableJson({
    taskId: input.taskId,
    executor: input.executor,
    status: input.status,
    resultSummary: input.resultSummary,
    method: input.method,
    reproducibleInput: input.reproducibleInput,
    evidenceRefs: input.evidenceRefs,
  }))

  await db.prepare(
    "INSERT OR IGNORE INTO analysis_results(task_id, executor, status, result_summary, method, reproducible_input, evidence_refs_json, result_sha256, completed_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    taskId,
    input.executor,
    input.status,
    input.resultSummary,
    input.method,
    input.reproducibleInput,
    JSON.stringify(input.evidenceRefs),
    resultSha256,
    now
  ).run()

  const result = await db.prepare(
    "SELECT task_id, executor, status, result_summary, method, reproducible_input, evidence_refs_json, result_sha256, completed_at FROM analysis_results WHERE task_id = ?"
  ).bind(taskId).first<ResultRow>()
  if (!result) throw new Error("analysis result was not readable after insert")
  if (result.result_sha256 !== resultSha256) throw new Error("analysis task already has a different immutable result")

  await db.prepare("UPDATE analysis_queue SET status = ?, updated_at = ? WHERE task_id = ? AND status = 'running'")
    .bind(input.status, now, taskId).run()
  const queueReadback = await getTask(db, taskId)
  if (queueReadback?.status !== input.status) throw new Error("analysis queue status did not match completed result")
  await db.prepare("DELETE FROM analysis_claims WHERE task_id = ? AND lease_id = ?").bind(taskId, input.leaseId).run()
  return rowToResult(result)
}

export async function releaseAnalysisTask(db: D1Database, taskId: string, leaseId: string): Promise<void> {
  const claim = await getClaim(db, taskId)
  if (!claim || claim.lease_id !== leaseId) throw new Error("analysis release requires the active matching lease")
  const now = new Date().toISOString()
  await db.prepare("DELETE FROM analysis_claims WHERE task_id = ? AND lease_id = ?").bind(taskId, leaseId).run()
  await db.prepare("UPDATE analysis_queue SET status = 'pending', updated_at = ? WHERE task_id = ? AND status = 'running'")
    .bind(now, taskId).run()
  const readback = await getTask(db, taskId)
  if (readback?.status !== "pending") throw new Error("analysis task did not read back as pending after release")
}

async function getAnalysisResult(db: D1Database, taskId: string): Promise<AnalysisResultRecord | null> {
  const row = await db.prepare(
    "SELECT task_id, executor, status, result_summary, method, reproducible_input, evidence_refs_json, result_sha256, completed_at FROM analysis_results WHERE task_id = ?"
  ).bind(taskId).first<ResultRow>()
  return row ? rowToResult(row) : null
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const analysisRoute = url.pathname.startsWith("/analysis/")
  if (analysisRoute && !isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 })

  if (request.method === "POST" && url.pathname === "/analysis/claim") {
    try {
      const body = await parseJsonBody(request) as Record<string, unknown>
      const taskId = boundedText(body?.taskId, "taskId", 500)
      const executor = body?.executor
      if (executor !== "research" && executor !== "wolfram") throw new Error("executor must be research or wolfram")
      const leaseMinutes = Number(body?.leaseMinutes ?? DEFAULT_LEASE_MINUTES)
      if (!Number.isFinite(leaseMinutes)) throw new Error("leaseMinutes must be numeric")
      const claim = await claimAnalysisTask(env.DB, taskId, executor, leaseMinutes)
      await addReceipt(env.DB, { runId: claim.leaseId, lane: LANE, action: "analysis-claim-readback", canonicalId: taskId, target: "d1-analysis-queue", status: "success", details: `executor=${executor};expires=${claim.expiresAt}` })
      return Response.json(claim)
    } catch (error) {
      return errorResponse(409, error instanceof Error ? error.message : String(error))
    }
  }

  if (request.method === "POST" && url.pathname === "/analysis/complete") {
    try {
      const body = await parseJsonBody(request)
      const result = await completeAnalysisTask(env.DB, body)
      await addReceipt(env.DB, { runId: crypto.randomUUID(), lane: LANE, action: "analysis-complete-readback", canonicalId: result.taskId, target: "d1-analysis-results", status: "success", details: `executor=${result.executor};status=${result.status};sha256=${result.resultSha256}` })
      return Response.json(result)
    } catch (error) {
      return errorResponse(409, error instanceof Error ? error.message : String(error))
    }
  }

  if (request.method === "POST" && url.pathname === "/analysis/release") {
    try {
      const body = await parseJsonBody(request) as Record<string, unknown>
      const taskId = boundedText(body?.taskId, "taskId", 500)
      const leaseId = boundedText(body?.leaseId, "leaseId", 200)
      await releaseAnalysisTask(env.DB, taskId, leaseId)
      await addReceipt(env.DB, { runId: leaseId, lane: LANE, action: "analysis-release-readback", canonicalId: taskId, target: "d1-analysis-queue", status: "success" })
      return Response.json({ taskId, status: "pending" })
    } catch (error) {
      return errorResponse(409, error instanceof Error ? error.message : String(error))
    }
  }

  if (request.method === "GET" && url.pathname === "/analysis/result") {
    const taskId = url.searchParams.get("taskId")?.trim()
    if (!taskId) return errorResponse(400, "taskId query parameter is required")
    const result = await getAnalysisResult(env.DB, taskId)
    if (!result) return errorResponse(404, "analysis result not found")
    return Response.json(result)
  }

  return feedHandleFetch(request, env)
}

export async function scheduled(controller: ScheduledLike, env: Env): Promise<void> {
  await feedScheduled(controller, env)
}

export type { Env, ScheduledLike }
