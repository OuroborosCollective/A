import { AUTHORITY_VERSION } from "./consent.js"
import type { AnalysisTask } from "./domain/types.js"

export interface D1Result<T = unknown> {
  success: boolean
  results?: T[]
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
}

export async function getState<T>(db: D1Database, lane: string): Promise<T | undefined> {
  const row = await db.prepare("SELECT state_json FROM sync_state WHERE lane = ?").bind(lane).first<{ state_json: string }>()
  if (!row?.state_json) return undefined
  return JSON.parse(row.state_json) as T
}

export async function putState(db: D1Database, lane: string, state: unknown): Promise<void> {
  await db.prepare(
    "INSERT INTO sync_state(lane, state_json, updated_at) VALUES(?, ?, ?) ON CONFLICT(lane) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at"
  ).bind(lane, JSON.stringify(state), new Date().toISOString()).run()
}

export async function rememberRecord(
  db: D1Database,
  id: string,
  kind: "source" | "signal",
  recordSha256: string,
  payload: unknown,
  notionPageId?: string
): Promise<void> {
  await db.prepare(
    "INSERT INTO records(canonical_id, kind, record_sha256, notion_page_id, payload_json, last_seen_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(canonical_id) DO UPDATE SET record_sha256=excluded.record_sha256, notion_page_id=COALESCE(excluded.notion_page_id, records.notion_page_id), payload_json=excluded.payload_json, last_seen_at=excluded.last_seen_at"
  ).bind(id, kind, recordSha256, notionPageId ?? null, JSON.stringify(payload), new Date().toISOString()).run()
}

export async function queueAnalysisTask(db: D1Database, task: AnalysisTask): Promise<void> {
  await db.prepare(
    "INSERT INTO analysis_queue(task_id, source_canonical_id, kind, executor, status, requires_human_review, payload_json, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET kind=excluded.kind, executor=excluded.executor, requires_human_review=excluded.requires_human_review, payload_json=excluded.payload_json, updated_at=excluded.updated_at"
  ).bind(
    task.taskId,
    task.sourceCanonicalId,
    task.kind,
    task.executor,
    task.status,
    task.requiresHumanReview ? 1 : 0,
    JSON.stringify(task),
    task.createdAt,
    new Date().toISOString()
  ).run()
}

export async function listPendingAnalysisTasks(db: D1Database, limit = 25): Promise<AnalysisTask[]> {
  const bounded = Math.max(1, Math.min(100, Math.floor(limit)))
  const result = await db.prepare(
    "SELECT payload_json FROM analysis_queue WHERE status = 'pending' ORDER BY requires_human_review ASC, created_at ASC LIMIT ?"
  ).bind(bounded).all<{ payload_json: string }>()
  return (result.results ?? []).flatMap((row) => {
    try {
      return [JSON.parse(row.payload_json) as AnalysisTask]
    } catch {
      return []
    }
  })
}

export async function addReceipt(
  db: D1Database,
  input: {
    runId: string
    lane: string
    action: string
    canonicalId?: string
    target: string
    status: "success" | "failure" | "preview"
    details?: string
  }
): Promise<void> {
  const id = `${input.runId}:${input.lane}:${input.action}:${input.canonicalId ?? "-"}:${crypto.randomUUID()}`
  await db.prepare(
    "INSERT INTO action_receipts(id, run_id, lane, action, canonical_id, target, authority_version, status, details, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    input.runId,
    input.lane,
    input.action,
    input.canonicalId ?? null,
    input.target,
    AUTHORITY_VERSION,
    input.status,
    input.details ?? "",
    new Date().toISOString()
  ).run()
}
