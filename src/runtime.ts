import {
  collectCommitBackfillPage,
  collectCommitPage,
  collectFeedPage,
  collectForumPage,
  collectReleasePage,
  collectWaybackPage,
  type CommitBackfillState,
  type CommitSyncState,
  type FeedSyncState,
  type ForumSyncState,
  type WaybackSyncState,
} from "./sync.js"
import { NOTION_TARGETS } from "./consent.js"
import {
  upsertClaimToNotion,
  upsertFollowUpPlanToNotion,
  upsertSignalToNotion,
  upsertSourceToNotion,
} from "./notion-api.js"
import {
  addReceipt,
  getRecordMeta,
  getState,
  hasSuccessfulReceipt,
  listPendingAnalysisTasks,
  putState,
  queueAnalysisTask,
  rememberRecord,
  type D1Database,
} from "./storage.js"
import { deriveAnalysisTasks, deriveFollowUpPlan, extractClaimCandidates } from "./domain/research.js"
import type { AnalysisTask, HypeSignal, ResearchSource } from "./domain/types.js"

export type Lane = "commits" | "releases" | "wayback" | "feeds" | "forum" | "backfill"

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

function deepResearchEligible(source: ResearchSource): boolean {
  return source.lane === "Satoshi Forum"
    || source.lane === "Forum Claims"
    || source.subjects.includes("Identität")
    || source.subjects.includes("Kryptografie")
}

async function queueTasks(env: Env, lane: Lane, runId: string, tasks: AnalysisTask[]): Promise<void> {
  for (const task of tasks) {
    await queueAnalysisTask(env.DB, task)
    await addReceipt(env.DB, {
      runId,
      lane,
      action: "analysis-queued",
      canonicalId: task.taskId,
      target: "d1-analysis-queue",
      status: "success",
      details: `${task.executor}:${task.kind};human_review=${task.requiresHumanReview}`,
    })
  }
}

async function persistResearchArtifacts(
  env: Env,
  lane: Lane,
  runId: string,
  source: ResearchSource,
  sourcePageId?: string
): Promise<void> {
  if (!deepResearchEligible(source)) return

  const claims = extractClaimCandidates(source)
  const tasks = deriveAnalysisTasks(source, claims)
  const plan = deriveFollowUpPlan(source, claims, tasks)
  const currentMode = mode(env)

  if (currentMode === "preview") {
    for (const claim of claims) {
      await addReceipt(env.DB, { runId, lane, action: "claim-candidate", canonicalId: claim.claimKey, target: NOTION_TARGETS.claims, status: "preview" })
    }
    if (plan) await addReceipt(env.DB, { runId, lane, action: "follow-up-plan", canonicalId: plan.planKey, target: NOTION_TARGETS.followups, status: "preview" })
    for (const task of tasks) {
      await addReceipt(env.DB, { runId, lane, action: "analysis-queue", canonicalId: task.taskId, target: "d1-analysis-queue", status: "preview", details: `${task.executor}:${task.kind}` })
    }
    return
  }

  if (!sourcePageId) throw new Error(`Live research artifacts require source page readback: ${source.canonicalId}`)

  if (plan && await hasSuccessfulReceipt(env.DB, "follow-up-readback", plan.planKey)) {
    await queueTasks(env, lane, runId, tasks)
    await addReceipt(env.DB, {
      runId,
      lane,
      action: "research-artifacts-reused",
      canonicalId: source.canonicalId,
      target: NOTION_TARGETS.followups,
      status: "success",
      details: "Existing successful claim/follow-up readback reused; D1 analysis tasks refreshed idempotently",
    })
    return
  }

  const token = requireNotionToken(env)
  for (const claim of claims) {
    const claimPageId = await upsertClaimToNotion(token, claim, sourcePageId)
    await addReceipt(env.DB, {
      runId,
      lane,
      action: "claim-open-readback",
      canonicalId: claim.claimKey,
      target: NOTION_TARGETS.claims,
      status: "success",
      details: `page=${claimPageId};status=Offen;evidence=Behauptet`,
    })
  }

  if (plan) {
    const planPageId = await upsertFollowUpPlanToNotion(token, plan)
    await addReceipt(env.DB, {
      runId,
      lane,
      action: "follow-up-readback",
      canonicalId: plan.planKey,
      target: NOTION_TARGETS.followups,
      status: "success",
      details: `page=${planPageId};status=Offen`,
    })
  }

  await queueTasks(env, lane, runId, tasks)
}

async function persistSources(env: Env, lane: Lane, runId: string, records: ResearchSource[]): Promise<void> {
  const currentMode = mode(env)
  let failures = 0
  for (const record of records) {
    try {
      const existing = await getRecordMeta(env.DB, record.canonicalId)
      await rememberRecord(env.DB, record.canonicalId, "source", record.recordSha256, record)
      if (currentMode === "preview") {
        await addReceipt(env.DB, { runId, lane, action: "notion-upsert", canonicalId: record.canonicalId, target: NOTION_TARGETS.sources, status: "preview" })
        await persistResearchArtifacts(env, lane, runId, record)
        continue
      }

      let pageId: string
      if (existing?.recordSha256 === record.recordSha256 && existing.notionPageId) {
        pageId = existing.notionPageId
        await addReceipt(env.DB, {
          runId,
          lane,
          action: "notion-source-reused",
          canonicalId: record.canonicalId,
          target: NOTION_TARGETS.sources,
          status: "success",
          details: `page=${pageId};unchanged_hash=true`,
        })
      } else {
        pageId = await upsertSourceToNotion(requireNotionToken(env), record)
        await rememberRecord(env.DB, record.canonicalId, "source", record.recordSha256, record, pageId)
        await addReceipt(env.DB, { runId, lane, action: "notion-upsert-readback", canonicalId: record.canonicalId, target: NOTION_TARGETS.sources, status: "success", details: `page=${pageId}` })
      }
      await persistResearchArtifacts(env, lane, runId, record, pageId)
    } catch (error) {
      failures += 1
      await addReceipt(env.DB, { runId, lane, action: "source-pipeline", canonicalId: record.canonicalId, target: NOTION_TARGETS.sources, status: "failure", details: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) })
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
  if (lane === "forum") {
    const state = await getState<ForumSyncState>(env.DB, lane)
    const page = await collectForumPage(state)
    await persistSources(env, lane, runId, page.records)
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
    case "23 */2 * * *": return "forum"
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
    return Response.json({ ok: true, mode: mode(env), revision: env.REVISION ?? "unknown", notionTargets: Object.values(NOTION_TARGETS) })
  }
  if (request.method === "GET" && url.pathname === "/analysis/pending") {
    if (!authorized(request, env)) return new Response("Unauthorized", { status: 401 })
    const limit = Number(url.searchParams.get("limit") ?? "25")
    const tasks: AnalysisTask[] = await listPendingAnalysisTasks(env.DB, Number.isFinite(limit) ? limit : 25)
    return Response.json({ count: tasks.length, tasks })
  }
  if (request.method === "POST" && url.pathname.startsWith("/run/")) {
    if (!authorized(request, env)) return new Response("Unauthorized", { status: 401 })
    const lane = url.pathname.slice("/run/".length) as Lane
    if (!["commits", "releases", "wayback", "feeds", "forum", "backfill"].includes(lane)) return new Response("Unknown lane", { status: 404 })
    return Response.json(await runLane(lane, env))
  }
  return new Response("Not found", { status: 404 })
}
