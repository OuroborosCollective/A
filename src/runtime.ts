import {
  collectCommitBackfillPage,
  collectCommitPage,
  collectFeedPage,
  collectReleasePage,
  collectWaybackPage,
  type CommitBackfillState,
  type CommitSyncState,
  type FeedSyncState,
  type WaybackSyncState,
} from "./sync.js"
import { NOTION_TARGETS } from "./consent.js"
import { upsertSignalToNotion, upsertSourceToNotion } from "./notion-api.js"
import { addReceipt, getState, putState, rememberRecord, type D1Database } from "./storage.js"
import type { HypeSignal, ResearchSource } from "./domain/types.js"

export type Lane = "commits" | "releases" | "wayback" | "feeds" | "backfill"

export interface Env {
  DB: D1Database
  AUTONOMY_MODE?: "preview" | "live"
  NOTION_API_TOKEN?: string
  GITHUB_TOKEN?: string
  ADMIN_TOKEN?: string
  REVISION?: string
}

export interface ScheduledLike {
  cron: string
  scheduledTime: number
}

function mode(env: Env): "preview" | "live" {
  return env.AUTONOMY_MODE === "live" ? "live" : "preview"
}

function requireNotionToken(env: Env): string {
  const token = env.NOTION_API_TOKEN?.trim()
  if (!token) throw new Error("AUTONOMY_MODE=live requires NOTION_API_TOKEN")
  return token
}

async function persistSources(env: Env, lane: Lane, runId: string, records: ResearchSource[]): Promise<void> {
  const currentMode = mode(env)
  let failures = 0
  for (const record of records) {
    try {
      await rememberRecord(env.DB, record.canonicalId, "source", record.recordSha256, record)
      if (currentMode === "preview") {
        await addReceipt(env.DB, { runId, lane, action: "notion-upsert", canonicalId: record.canonicalId, target: NOTION_TARGETS.sources, status: "preview" })
        continue
      }
      const pageId = await upsertSourceToNotion(requireNotionToken(env), record)
      await rememberRecord(env.DB, record.canonicalId, "source", record.recordSha256, record, pageId)
      await addReceipt(env.DB, { runId, lane, action: "notion-upsert-readback", canonicalId: record.canonicalId, target: NOTION_TARGETS.sources, status: "success", details: `page=${pageId}` })
    } catch (error) {
      failures += 1
      await addReceipt(env.DB, { runId, lane, action: "notion-upsert-readback", canonicalId: record.canonicalId, target: NOTION_TARGETS.sources, status: "failure", details: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) })
    }
  }
  if (failures) throw new Error(`${failures} source record(s) failed in lane ${lane}`)
}

async function persistSignals(env: Env, lane: Lane, runId: string, records: HypeSignal[]): Promise<void> {
  const currentMode = mode(env)
  let failures = 0
  for (const record of records) {
    try {
      await rememberRecord(env.DB, record.signalId, "signal", record.recordSha256, record)
      if (currentMode === "preview") {
        await addReceipt(env.DB, { runId, lane, action: "notion-upsert", canonicalId: record.signalId, target: NOTION_TARGETS.hype, status: "preview" })
        continue
      }
      const pageId = await upsertSignalToNotion(requireNotionToken(env), record)
      await rememberRecord(env.DB, record.signalId, "signal", record.recordSha256, record, pageId)
      await addReceipt(env.DB, { runId, lane, action: "notion-upsert-readback", canonicalId: record.signalId, target: NOTION_TARGETS.hype, status: "success", details: `page=${pageId}` })
    } catch (error) {
      failures += 1
      await addReceipt(env.DB, { runId, lane, action: "notion-upsert-readback", canonicalId: record.signalId, target: NOTION_TARGETS.hype, status: "failure", details: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) })
    }
  }
  if (failures) throw new Error(`${failures} signal record(s) failed in lane ${lane}`)
}

export async function runLane(lane: Lane, env: Env): Promise<{ lane: Lane; mode: string; count: number; hasMore: boolean }> {
  const runId = crypto.randomUUID()
  const currentMode = mode(env)
  await addReceipt(env.DB, { runId, lane, action: "run-start", target: "cloudflare-worker", status: currentMode === "live" ? "success" : "preview", details: `revision=${env.REVISION ?? "unknown"}` })

  if (lane === "commits") {
    const state = await getState<CommitSyncState>(env.DB, lane)
    const page = await collectCommitPage(state, env.GITHUB_TOKEN)
    await persistSources(env, lane, runId, page.records)
    if (currentMode === "live") await putState(env.DB, lane, page.nextState)
    return { lane, mode: currentMode, count: page.records.length, hasMore: page.hasMore }
  }
  if (lane === "releases") {
    const page = await collectReleasePage(env.GITHUB_TOKEN)
    await persistSources(env, lane, runId, page.records)
    if (currentMode === "live") await putState(env.DB, lane, page.nextState)
    return { lane, mode: currentMode, count: page.records.length, hasMore: false }
  }
  if (lane === "wayback") {
    const state = await getState<WaybackSyncState>(env.DB, lane)
    const page = await collectWaybackPage(state)
    await persistSources(env, lane, runId, page.records)
    if (currentMode === "live") await putState(env.DB, lane, page.nextState)
    return { lane, mode: currentMode, count: page.records.length, hasMore: page.hasMore }
  }
  if (lane === "feeds") {
    const state = await getState<FeedSyncState>(env.DB, lane)
    const page = await collectFeedPage(state)
    await persistSignals(env, lane, runId, page.records)
    if (currentMode === "live") await putState(env.DB, lane, page.nextState)
    return { lane, mode: currentMode, count: page.records.length, hasMore: page.hasMore }
  }

  const state = await getState<CommitBackfillState>(env.DB, lane)
  const page = await collectCommitBackfillPage(state, env.GITHUB_TOKEN)
  await persistSources(env, lane, runId, page.records)
  if (currentMode === "live") await putState(env.DB, lane, page.nextState)
  return { lane, mode: currentMode, count: page.records.length, hasMore: page.hasMore }
}

export function laneForCron(cron: string): Lane | null {
  switch (cron) {
    case "*/15 * * * *": return "commits"
    case "7 * * * *": return "releases"
    case "17 */6 * * *": return "wayback"
    case "*/30 * * * *": return "feeds"
    default: return null
  }
}

export async function scheduled(controller: ScheduledLike, env: Env): Promise<void> {
  const lane = laneForCron(controller.cron)
  if (!lane) throw new Error(`Unknown cron trigger: ${controller.cron}`)
  await runLane(lane, env)
}

function authorized(request: Request, env: Env): boolean {
  const configured = env.ADMIN_TOKEN?.trim()
  if (!configured) return false
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  return supplied === configured
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true, mode: mode(env), revision: env.REVISION ?? "unknown", notionTargets: [NOTION_TARGETS.sources, NOTION_TARGETS.hype] })
  }
  if (request.method === "POST" && url.pathname.startsWith("/run/")) {
    if (!authorized(request, env)) return new Response("Unauthorized", { status: 401 })
    const lane = url.pathname.slice("/run/".length) as Lane
    if (!["commits", "releases", "wayback", "feeds", "backfill"].includes(lane)) return new Response("Unknown lane", { status: 404 })
    return Response.json(await runLane(lane, env))
  }
  return new Response("Not found", { status: 404 })
}
