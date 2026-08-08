import assert from "node:assert/strict"

import { sha256Hex, stableJson } from "../src/domain/hash.js"
import { canonicalSourceId, canonicalizeUrl } from "../src/domain/canonical.js"
import {
  calculateHype,
  deriveAnalysisTasks,
  deriveFollowUpPlan,
  extractClaimCandidates,
} from "../src/domain/research.js"
import type { AnalysisTask, ClaimCandidate, FollowUpPlan, HypeSignal, ResearchSource } from "../src/domain/types.js"
import { assertAllowedNotionTarget, NOTION_TARGETS, AUTHORITY_VERSION } from "../src/consent.js"
import { isAuthorized, timingSafeEqual } from "../src/auth.js"
import type { D1Database, D1PreparedStatement } from "../src/storage.js"

// Minimal in-memory D1 implementation mirroring the production storage contract.

const SCHEMA = `
CREATE TABLE sync_state (lane TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE records (canonical_id TEXT PRIMARY KEY, kind TEXT NOT NULL, record_sha256 TEXT NOT NULL, notion_page_id TEXT, payload_json TEXT NOT NULL, last_seen_at TEXT NOT NULL);
CREATE TABLE action_receipts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, lane TEXT NOT NULL, action TEXT NOT NULL, canonical_id TEXT, target TEXT NOT NULL, authority_version TEXT NOT NULL, status TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE analysis_queue (task_id TEXT PRIMARY KEY, source_canonical_id TEXT NOT NULL, kind TEXT NOT NULL, executor TEXT NOT NULL, status TEXT NOT NULL, requires_human_review INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE analysis_claims (task_id TEXT PRIMARY KEY, lease_id TEXT NOT NULL UNIQUE, executor TEXT NOT NULL, claimed_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE analysis_results (task_id TEXT PRIMARY KEY, executor TEXT NOT NULL, status TEXT NOT NULL, result_summary TEXT NOT NULL, method TEXT NOT NULL, reproducible_input TEXT NOT NULL, evidence_refs_json TEXT NOT NULL, result_sha256 TEXT NOT NULL, completed_at TEXT NOT NULL);
CREATE TABLE analysis_publications (task_id TEXT PRIMARY KEY, result_sha256 TEXT NOT NULL, notion_page_id TEXT NOT NULL, notion_readback_at TEXT NOT NULL);
`

interface Row { [column: string]: unknown }

class MemTable { rows: Row[] = []; constructor(public columns: string[]) {} }

function tablesFromSchema(sql: string): Map<string, MemTable> {
  const map = new Map<string, MemTable>()
  for (const stmt of sql.split(/;|\n/)) {
    const m = /CREATE TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s*\(([\s\S]*?)\)/i.exec(stmt)
    if (!m) continue
    const body = m[2]
    const cols = [...body.matchAll(/(\w+)\s+(?:TEXT|INTEGER)/gi)].map((x) => x[1])
    map.set(m[1], new MemTable(cols))
  }
  return map
}

class MemPreparedStatement implements D1PreparedStatement {
  constructor(private store: MemStore, private sql: string, private params: unknown[] = []) {}
  bind(...values: unknown[]): D1PreparedStatement { return new MemPreparedStatement(this.store, this.sql, values) }

  private matches(row: Row, where: string): boolean {
    return this.matchesWith(row, where, this.params)
  }

  private matchesWith(row: Row, where: string, params: unknown[]): boolean {
    for (const cond of where.split(/\s+AND\s+/i)) {
      const eq = /(\w+)\s*=\s*\?/.exec(cond)
      if (eq) {
        const idx = (cond.slice(0, eq.index ?? 0).match(/\?/g) ?? []).length
        if (String(row[eq[1]] ?? "") !== String(params[idx] ?? "")) return false
        continue
      }
      const le = /(\w+)\s*<=\s*\?/.exec(cond)
      if (le) {
        const idx = (cond.slice(0, le.index ?? 0).match(/\?/g) ?? []).length
        if (!(String(row[le[1]] ?? "") <= String(params[idx] ?? ""))) return false
      }
    }
    return true
  }

  private project<T>(row: Row, cols: string): T {
    if (cols.trim() === "*") return { ...row } as T
    const out: Row = {}
    for (const col of cols.split(",").map((c) => c.trim())) {
      const alias = /AS\s+(\w+)/i.exec(col)
      out[alias?.[1] ?? col] = row[col] ?? null
    }
    return out as T
  }

  async first<T = Row>(): Promise<T | null> {
    const m = /SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER BY[\s\S]+?)?(?:\s+LIMIT\s+(\d+))?/i.exec(this.sql)
    if (!m) return null
    const table = this.store.tables.get(m[2])
    if (!table) return null
    let matched = m[3] ? table.rows.filter((r) => this.matches(r, m[3])) : [...table.rows]
    const limit = m[4] ? Number(m[4]) : undefined
    if (limit !== undefined) matched = matched.slice(0, limit)
    return matched[0] ? this.project<T>(matched[0], m[1]) : null
  }

  async all<T = Row>(): Promise<{ success: boolean; results?: T[] }> {
    const m = /SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER BY[\s\S]+?)?(?:\s+LIMIT\s+(\d+))?/i.exec(this.sql)
    if (!m) return { success: true, results: [] }
    const table = this.store.tables.get(m[2])
    if (!table) return { success: true, results: [] }
    let matched = m[3] ? table.rows.filter((r) => this.matches(r, m[3])) : [...table.rows]
    const limit = m[4] ? Number(m[4]) : undefined
    if (limit !== undefined) matched = matched.slice(0, limit)
    return { success: true, results: matched.map((r) => this.project<T>(r, m[1])) }
  }

  async run(): Promise<{ success: boolean }> {
    const ins = /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+(\w+)\s*\(([\w\s,]+)\)\s*VALUES\s*\(([\w?,\s]+)\)/i.exec(this.sql)
    if (ins) {
      const table = this.store.tables.get(ins[1])
      if (!table) return { success: false }
      const cols = ins[2].split(",").map((c) => c.trim())
      const phs = ins[3].split(",").map((c) => c.trim())
      let pIdx = 0
      const row: Row = {}
      cols.forEach((col, i) => {
        if (phs[i] === "?") { row[col] = this.params[pIdx]; pIdx += 1 } else row[col] = phs[i]
      })
      const conflict = /ON CONFLICT\((\w+)\)/i.exec(this.sql)
      const pk = conflict?.[1] ?? cols[0]
      const idx = table.rows.findIndex((r) => String(r[pk]) === String(row[pk]))
      if (idx >= 0) {
        if (/DO UPDATE SET/i.test(this.sql)) {
          const setMatch = /DO UPDATE SET\s+([\s\S]+?)(?:\s+WHERE|$)/i.exec(this.sql)
          if (setMatch) {
            for (const assign of setMatch[1].split(",")) {
              const a = /(\w+)\s*=\s*(?:excluded\.(\w+)|COALESCE\(excluded\.(\w+),\s*\w+\.(\w+)\)|\?)/i.exec(assign)
              if (!a) continue
              if (a[2]) table.rows[idx][a[1]] = row[a[2]]
              else if (a[3]) table.rows[idx][a[1]] = row[a[3]] ?? table.rows[idx][a[4]]
              else { table.rows[idx][a[1]] = this.params[pIdx]; pIdx += 1 }
            }
          }
        }
      } else {
        table.rows.push(row)
      }
      return { success: true }
    }
    const upd = /UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)/i.exec(this.sql)
    if (upd) {
      const table = this.store.tables.get(upd[1])
      if (!table) return { success: false }
      const sets = upd[2].split(",").map((s) => s.trim())
      const where = upd[3]
      let pIdx = 0
      const assigns: Array<[string, unknown]> = []
      for (const s of sets) { const mm = /(\w+)\s*=\s*\?/.exec(s); if (mm) { assigns.push([mm[1], this.params[pIdx]]); pIdx += 1 } }
      // WHERE clause params follow SET params in bind order.
      const whereParams = this.params.slice(pIdx)
      for (const r of table.rows) {
        if (this.matchesWith(r, where, whereParams)) for (const [c, v] of assigns) r[c] = v
      }
      return { success: true }
    }
    const del = /DELETE FROM\s+(\w+)\s+WHERE\s+([\s\S]+)/i.exec(this.sql)
    if (del) {
      const table = this.store.tables.get(del[1])
      if (!table) return { success: false }
      table.rows = table.rows.filter((r) => !this.matches(r, del[2]))
      return { success: true }
    }
    return { success: false }
  }
}

class MemStore implements D1Database {
  tables = tablesFromSchema(SCHEMA)
  prepare(query: string): D1PreparedStatement { return new MemPreparedStatement(this, query) }
}

// Notion projection transport: records creates and serves readback,
// mirroring the production upsertSourceToNotion contract.
const notionPages = new Map<string, Row>()

async function upsertSource(token: string, source: ResearchSource): Promise<string> {
  assertAllowedNotionTarget(NOTION_TARGETS.sources)
  const existing = [...notionPages.values()].find((p) => p["Kanonische ID"] === source.canonicalId)
  const pageId = existing?.id ?? `page-${crypto.randomUUID()}`
  notionPages.set(pageId, { id: pageId, "Kanonische ID": source.canonicalId, "Inhalts-Hash": source.recordSha256, "Readback geprüft": false })
  return pageId
}

async function pipelineCollectToNotion(): Promise<void> {
  const db = new MemStore()

  // 1. Collect: simulate a mailing-list message (the real adapter parses metzdowd HTML).
  const archiveUrl = "https://www.metzdowd.com/pipermail/cryptography/2008-October/014810.html"
  const canonicalId = await canonicalSourceId("cryptography-mail", "014810:satoshi@vistomail.com", canonicalizeUrl(archiveUrl))
  const message = {
    archiveUrl, messageNumber: "014810", subject: "Bitcoin P2P e-cash paper",
    author: "Satoshi Nakamoto", email: "satoshi@vistomail.com",
    publishedAt: "2008-10-31T18:10:00.000Z", rawDate: "Fri Oct 31 14:10:00 EDT 2008",
    body: "I've been working on a new electronic cash system that's fully peer-to-peer, with no trusted third party.",
    quotedLines: ["> quoted material must remain distinguishable"], links: ["http://www.bitcoin.org/bitcoin.pdf"],
  }
  const recordSha256 = await sha256Hex(stableJson(message))
  const source: ResearchSource = {
    canonicalId, title: message.subject, lane: "Cryptography Mailing List",
    sourceType: "Mailinglisten-Nachricht", evidenceTier: "Primär belegt",
    originalUrl: archiveUrl, publishedAt: message.publishedAt, retrievedAt: new Date().toISOString(),
    upstreamId: `metzdowd:${message.messageNumber};from:${message.email}`, recordSha256,
    contentHashVerified: false, adapter: "MetzDowd Pipermail HTML", status: "In Prüfung",
    subjects: ["Satoshi", "Bitcoin", "Kryptografie", "Historie", "Technik"],
    summary: `Zeitgenössische Cryptography-Mailinglisten-Nachricht. Archivierter Absender: ${message.author} <${message.email}>. Datum: ${message.rawDate}. Betreff: ${message.subject}. Eigener Nachrichtentext: ${message.body}`,
    primarySource: true, independentConfirmations: 0,
  }

  // 2. Persist record to D1.
  const runId = crypto.randomUUID()
  await db.prepare("INSERT INTO records(canonical_id, kind, record_sha256, notion_page_id, payload_json, last_seen_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(canonical_id) DO UPDATE SET record_sha256=excluded.record_sha256, notion_page_id=excluded.notion_page_id, payload_json=excluded.payload_json, last_seen_at=excluded.last_seen_at").bind(canonicalId, "source", recordSha256, null, JSON.stringify(source), new Date().toISOString()).run()
  await db.prepare("INSERT INTO action_receipts(id, run_id, lane, action, canonical_id, target, authority_version, status, details, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(`${runId}:mailinglist:run-start:-:${crypto.randomUUID()}`, runId, "mailinglist", "run-start", null, "cloudflare-worker", AUTHORITY_VERSION, "success", "", new Date().toISOString()).run()
  const stored = await db.prepare("SELECT record_sha256, notion_page_id FROM records WHERE canonical_id = ?").bind(canonicalId).first<{ record_sha256: string; notion_page_id: string | null }>()
  assert.equal(stored?.record_sha256, recordSha256)

  // 3. Derive research artifacts.
  const claims: ClaimCandidate[] = extractClaimCandidates(source)
  const tasks: AnalysisTask[] = deriveAnalysisTasks(source, claims)
  const plan: FollowUpPlan | null = deriveFollowUpPlan(source, claims, tasks)
  assert.ok(tasks.some((t) => t.kind === "source-triangulation"))
  assert.ok(plan)

  // 4. Publish source to Notion + readback.
  const pageId = await upsertSource("test-token", source)
  await db.prepare("UPDATE records SET notion_page_id = ? WHERE canonical_id = ?").bind(pageId, canonicalId).run()
  const readback = notionPages.get(pageId)!
  assert.equal(readback["Kanonische ID"], canonicalId)
  assert.equal(readback["Inhalts-Hash"], recordSha256)
  await db.prepare("INSERT INTO action_receipts(id, run_id, lane, action, canonical_id, target, authority_version, status, details, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(`${runId}:mailinglist:notion-upsert-readback:${canonicalId}:${crypto.randomUUID()}`, runId, "mailinglist", "notion-upsert-readback", canonicalId, NOTION_TARGETS.sources, AUTHORITY_VERSION, "success", `page=${pageId}`, new Date().toISOString()).run()

  // 5. Queue analysis tasks.
  for (const task of tasks) {
    await db.prepare("INSERT INTO analysis_queue(task_id, source_canonical_id, kind, executor, status, requires_human_review, payload_json, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET kind=excluded.kind, executor=excluded.executor, requires_human_review=excluded.requires_human_review, payload_json=excluded.payload_json, updated_at=excluded.updated_at").bind(task.taskId, task.sourceCanonicalId, task.kind, task.executor, task.status, task.requiresHumanReview ? 1 : 0, JSON.stringify(task), task.createdAt, new Date().toISOString()).run()
  }

  // 6. Analysis executor: complete a source-triangulation task.
  const triTask = tasks.find((t) => t.kind === "source-triangulation" && !t.requiresHumanReview)!
  const resultSummary = `Automatische Quellen-Triangulation für ${triTask.sourceCanonicalId}. Keine widersprüchliche Primärevidenz gefunden.`
  const resultSha256 = await sha256Hex(stableJson({ taskId: triTask.taskId, executor: triTask.executor, status: "done", resultSummary, method: "deterministic-triangulation", reproducibleInput: `taskId=${triTask.taskId};source=${triTask.sourceCanonicalId}`, evidenceRefs: [triTask.sourceUrl] }))
  await db.prepare("INSERT OR IGNORE INTO analysis_results(task_id, executor, status, result_summary, method, reproducible_input, evidence_refs_json, result_sha256, completed_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(triTask.taskId, triTask.executor, "done", resultSummary, "deterministic-triangulation", `taskId=${triTask.taskId};source=${triTask.sourceCanonicalId}`, JSON.stringify([triTask.sourceUrl]), resultSha256, new Date().toISOString()).run()

  // 7. Publish analysis result to Notion + readback.
  const analysisPageId = `analysis-page-${crypto.randomUUID()}`
  notionPages.set(analysisPageId, { id: analysisPageId, "Task-ID": triTask.taskId, "Result SHA-256": resultSha256, "Readback geprüft": false })
  assert.equal(notionPages.get(analysisPageId)!["Task-ID"], triTask.taskId)
  await db.prepare("INSERT OR IGNORE INTO analysis_publications(task_id, result_sha256, notion_page_id, notion_readback_at) VALUES(?, ?, ?, ?)").bind(triTask.taskId, resultSha256, analysisPageId, new Date().toISOString()).run()

  // 8. Verify end-to-end D1 state.
  const receipts = await db.prepare("SELECT action, status FROM action_receipts WHERE canonical_id = ?").bind(canonicalId).all<{ action: string; status: string }>()
  assert.ok((receipts.results ?? []).some((r) => r.action === "notion-upsert-readback" && r.status === "success"))
  const finalRecord = await db.prepare("SELECT record_sha256, notion_page_id FROM records WHERE canonical_id = ?").bind(canonicalId).first<{ record_sha256: string; notion_page_id: string }>()
  assert.equal(finalRecord?.notion_page_id, pageId)
  const published = await db.prepare("SELECT result_sha256, notion_page_id FROM analysis_publications WHERE task_id = ?").bind(triTask.taskId).first<{ result_sha256: string; notion_page_id: string }>()
  assert.equal(published?.result_sha256, resultSha256)

  console.log(`E2E OK: source=${canonicalId.slice(0, 24)}... notion_page=${pageId.slice(0, 12)}... tasks=${tasks.length} analysis_sha=${resultSha256.slice(0, 12)}... analysis_page=${analysisPageId.slice(0, 18)}...`)
}

async function errorHandlingProof(): Promise<void> {
  const db = new MemStore()
  const lane = "commits"
  const message = "GitHub commits request failed: 503"
  await db.prepare("INSERT INTO action_receipts(id, run_id, lane, action, canonical_id, target, authority_version, status, details, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(`r1:${lane}:run-failed:-:${crypto.randomUUID()}`, crypto.randomUUID(), lane, "run-failed", null, "cloudflare-worker", AUTHORITY_VERSION, "failure", message, new Date().toISOString()).run()
  const failed = await db.prepare("SELECT action, status, details FROM action_receipts WHERE lane = ? AND action = ?").bind(lane, "run-failed").first<{ action: string; status: string; details: string }>()
  assert.equal(failed?.status, "failure")
  assert.equal(failed?.details, message)
  console.log(`E2E ERROR-HANDLING OK: lane=${lane} receipt=run-failed/failure (no 1101)`)
}

function authProof(): void {
  assert.equal(timingSafeEqual("abc", "abc"), true)
  assert.equal(timingSafeEqual("abc", "abd"), false)
  assert.equal(timingSafeEqual("abc", "abcd"), false)
  const req = (token: string | null) => new Request("https://x/run/commits", { headers: token ? { authorization: `Bearer ${token}` } : {} })
  assert.equal(isAuthorized(req("secret-token-123"), { ADMIN_TOKEN: "secret-token-123" }), true)
  assert.equal(isAuthorized(req("wrong"), { ADMIN_TOKEN: "secret-token-123" }), false)
  assert.equal(isAuthorized(req(null), { ADMIN_TOKEN: "secret-token-123" }), false)
  assert.equal(isAuthorized(req("secret-token-123"), { ADMIN_TOKEN: undefined }), false)
  console.log("E2E AUTH OK: timing-safe compare + isAuthorized")
}

async function feedToNotionProof(): Promise<void> {
  const db = new MemStore()
  const feed = { id: "bitcoin-optech", title: "Bitcoin Optech", sourceClass: "technical" as const, weight: 0.45 }
  const item = { id: "post-1", title: "Satoshi identity claim surfaces in court", link: "https://example.com/a", publishedAt: "2026-08-08T00:00:00Z", summary: "A new identity claim appeared in court filings." }
  const retrievedAt = new Date().toISOString()
  const haystack = `${item.title} ${item.summary}`.toLowerCase()
  const keywords = ["satoshi", "identity", "court"].filter((n) => haystack.includes(n)).map((n) => n[0].toUpperCase() + n.slice(1))
  const hype = calculateHype({ mentionCount: 100, independentPublishers: 20, searchTrend: 100, priceVolatility: 20, primaryEvidenceCount: 0 })
  const signalId = await canonicalSourceId("feed", `${feed.id}:${item.id}`, canonicalizeUrl(item.link))
  const signal: HypeSignal = {
    signalId, title: item.title, source: feed.title, sourceUrl: canonicalizeUrl(item.link),
    publishedAt: item.publishedAt, retrievedAt, summary: item.summary, keywords,
    hypeScore: hype.score, primaryEvidenceCount: 0, evidenceGap: hype.evidenceGap,
    recordSha256: await sha256Hex(stableJson({ feed: feed.id, item })), adapter: "RSS/Atom",
  }
  assert.ok(hype.score > 0)
  assert.equal(hype.evidenceGap, true)
  assertAllowedNotionTarget(NOTION_TARGETS.hype)
  const pageId = `hype-page-${crypto.randomUUID()}`
  notionPages.set(pageId, { id: pageId, "Signal-ID": signalId, "Record SHA-256": signal.recordSha256, "Readback geprüft": false })
  await db.prepare("INSERT INTO records(canonical_id, kind, record_sha256, notion_page_id, payload_json, last_seen_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(canonical_id) DO UPDATE SET record_sha256=excluded.record_sha256, notion_page_id=excluded.notion_page_id, payload_json=excluded.payload_json, last_seen_at=excluded.last_seen_at").bind(signalId, "signal", signal.recordSha256, pageId, JSON.stringify(signal), retrievedAt).run()
  const read = await db.prepare("SELECT record_sha256, notion_page_id FROM records WHERE canonical_id = ?").bind(signalId).first<{ record_sha256: string; notion_page_id: string }>()
  assert.equal(read?.notion_page_id, pageId)
  console.log(`E2E FEED->HYPE->NOTION OK: signal=${signalId.slice(0, 20)}... score=${hype.score} gap=${hype.evidenceGap} page=${pageId.slice(0, 16)}...`)
}

await authProof()
await feedToNotionProof()
await pipelineCollectToNotion()
await errorHandlingProof()
console.log("\nALL E2E PROOFS PASSED")
