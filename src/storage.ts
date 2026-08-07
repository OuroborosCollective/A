import { AUTHORITY_VERSION } from "./consent.js"

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
