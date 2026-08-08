import { isAuthorized } from "./auth.js"
import { runAnalysisExecutor } from "./runtime-analysis-executor-extension.js"
import {
  collectCommitBackfillPage,
  collectCommitPage,
  collectCommonCrawlPage,
  collectFeedPage,
  collectForumPage,
  collectHistoricalDiscoveryPage,
  collectReleasePage,
  collectSourceForgePage,
  collectWaybackPage,
  collectWikipediaPage,
  type CommitBackfillState,
  type CommitSyncState,
  type CommonCrawlSyncState,
  type FeedSyncState,
  type ForumSyncState,
  type HistoricalDiscoveryState,
  type SourceForgeSyncState,
  type WaybackSyncState,
  type WikipediaSyncState,
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

export type Lane =
  | "commits"
  | "releases"
  | "discovery"
  | "wayback"
  | "sourceforge"
  | "wikipedia"
  | "commoncrawl"
  | "feeds"
  | "forum"
  | "mailinglist"
  | "backfill"

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
    || source.lane === "SourceForge"
    || source.lane === "Wikipedia Reference Graph"
    || source.lane === "Global Web Archive"
    || source.subjects.includes("Satoshi")
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
  if (lane === "discovery") {
    const state = await getState<HistoricalDiscoveryState>(env.DB, lane)
    const page = await collectHistoricalDiscoveryPage(state)
    await persistSources(env, lane, runId, page.records)
    if (currentMode === "live") await putState(env.DB, lane, page.nextState)
    return { lane, mode: currentMode, count: page.records.length, hasMore: page.hasMore }
  }
  if (lane === "wayback") {
    const state = await getState<WaybackSyncState>(env.DB, lane)
    const page = await collectWaybackPage(state)
    await persistSources(env, lane, runId, page.records)
    if (currentMode === "live") await putState(env.DB, lane, page.nextState)
    return { lane, mode: currentMode, count: page.records.length, hasMore: page.hasMore }
  }
  if (lane === "sourceforge") {
    const state = await getState<SourceForgeSyncState>(env.DB, lane)
    const page = await collectSourceForgePage(state)
    await persistSources(env, lane, runId, page.records)
    if (currentMode === "live") await putState(env.DB, lane, page.nextState)
    return { lane, mode: currentMode, count: page.records.length, hasMore: page.hasMore }
  }
  if (lane === "wikipedia") {
    const state = await getState<WikipediaSyncState>(env.DB, lane)
    const page = await collectWikipediaPage(state)
    await persistSources(env, lane, runId, page.records)
    if (currentMode === "live") await putState(env.DB, lane, page.nextState)
    return { lane, mode: currentMode, count: page.records.length, hasMore: page.hasMore }
  }
  if (lane === "commoncrawl") {
    const state = await getState<CommonCrawlSyncState>(env.DB, lane)
    const page = await collectCommonCrawlPage(state)
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
  if (lane === "mailinglist") {
    throw new Error("mailinglist lane is served by the mailing-list runtime extension, not by runLane")
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
    case "17 */6 * * *": return "discovery"
    case "*/30 * * * *": return "feeds"
    case "23 */2 * * *": return "forum"
    default: return null
  }
}

// Lanes executed on every */30 sweep in addition to the primary feeds lane.
// Cron-triggered lanes need no ADMIN_TOKEN, so this keeps the recurring sweep
// running even when no external token secret is configured.
export const SWEEP_LANES: readonly Lane[] = ["commits", "feeds", "forum", "releases"]

// Run the analysis executor every 4h by piggybacking on the */30 sweep:
// 4h = 8 half-hour ticks, so execute when the hour is divisible by 4 at :00.
function shouldRunAnalysisExecutor(now: Date): boolean {
  return now.getMinutes() < 30 && now.getHours() % 4 === 0
}

export async function scheduled(controller: ScheduledLike, env: Env): Promise<void> {
  const lane = laneForCron(controller.cron)
  if (!lane) throw new Error(`Unknown cron trigger: ${controller.cron}`)
  await runLane(lane, env)

  // The */30 feeds slot doubles as a recurring multi-lane sweep so the runtime
  // collects fresh evidence every 30 minutes without an external caller.
  if (controller.cron === "*/30 * * * *") {
    for (const sweepLane of SWEEP_LANES) {
      if (sweepLane === lane) continue
      if (sweepLane === "feeds") continue
      try {
        await runLane(sweepLane, env)
      } catch (error) {
        // A failing sweep lane must not abort the remaining lanes; the
        // runLane error path already wrote a failure receipt.
        void error
      }
    }

    // Auto-execute pending analysis tasks every 4h (replaces the removed
    // '3 */4 * * *' cron — Cloudflare Free allows only 5 cron triggers).
    if (shouldRunAnalysisExecutor(new Date())) {
      try {
        await runAnalysisExecutor(env)
      } catch (error) {
        void error
      }
    }
  }
}

export const RUNNABLE_LANES: readonly Lane[] = [
  "commits", "releases", "discovery", "wayback", "sourceforge",
  "wikipedia", "commoncrawl", "feeds", "forum", "mailinglist", "backfill",
]

function laneError(lane: Lane, error: unknown, env: Env): Promise<Response> {
  const message = error instanceof Error ? error.message : String(error)
  return addReceipt(env.DB, {
    runId: crypto.randomUUID(),
    lane,
    action: "run-failed",
    target: "cloudflare-worker",
    status: "failure",
    details: message.slice(0, 500),
  }).then(() => Response.json(
    { ok: false, error: "lane-failed", lane, message },
    { status: 500 }
  ))
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true, mode: mode(env), revision: env.REVISION ?? "unknown", notionTargets: Object.values(NOTION_TARGETS) })
  }
  if (request.method === "GET" && url.pathname === "/analysis/pending") {
    if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 })
    const limit = Number(url.searchParams.get("limit") ?? "25")
    const tasks: AnalysisTask[] = await listPendingAnalysisTasks(env.DB, Number.isFinite(limit) ? limit : 25)
    return Response.json({ count: tasks.length, tasks })
  }
  if (request.method === "POST" && url.pathname.startsWith("/run/")) {
    if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 })
    const lane = url.pathname.slice("/run/".length) as Lane
    if (!(RUNNABLE_LANES as readonly string[]).includes(lane)) {
      return new Response("Unknown lane", { status: 404 })
    }
    if (lane === "mailinglist" || lane === "feeds") {
      // These lanes are served by the runtime extension that wraps this handler.
      return new Response("Not found", { status: 404 })
    }
    try {
      return Response.json(await runLane(lane, env))
    } catch (error) {
      return laneError(lane, error, env)
    }
  }
  return new Response("Not found", { status: 404 })
}
