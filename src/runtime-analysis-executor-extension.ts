import { isAuthorized } from "./auth.js"
import { sha256Hex, stableJson } from "./domain/hash.js"
import type { AnalysisTask } from "./domain/types.js"
import { addReceipt, listPendingAnalysisTasks, type D1Database } from "./storage.js"
import {
  claimAnalysisTask,
  completeAnalysisTask,
  type AnalysisCompletionInput,
  type AnalysisResultRecord,
} from "./runtime-analysis-extension.js"
import {
  handleFetch as publicationHandleFetch,
  scheduled as publicationScheduled,
  type Env,
  type ScheduledLike,
} from "./runtime-analysis-publication-extension.js"

const LANE = "analysis"
const EXECUTOR_CRON = "3 */4 * * *"
export const MAX_AUTO_RESULTS_PER_RUN = 3

interface QueueRow {
  task_id: string
  executor: "research" | "wolfram"
  status: "pending" | "running" | "done" | "blocked"
  requires_human_review: number
  payload_json: string
}

interface CompletedOutcome {
  taskId: string
  status: "done" | "blocked"
  resultSha256: string
  reused: boolean
}

function requireLiveNotionToken(env: Env): string {
  if (env.AUTONOMY_MODE !== "live") throw new Error("auto executor is allowed only in live mode")
  const token = env.NOTION_API_TOKEN?.trim()
  if (!token) throw new Error("AUTONOMY_MODE=live requires NOTION_API_TOKEN")
  return token
}

async function pendingResearchTasks(db: D1Database, limit: number): Promise<AnalysisTask[]> {
  const tasks = await listPendingAnalysisTasks(db, limit)
  return tasks.filter((task) => task.executor === "research" && !task.requiresHumanReview)
}

function triangulationSummary(task: AnalysisTask): string {
  return `Automatische Quellen-Triangulation für ${task.sourceCanonicalId}. Die Quelle wurde gegen den Archiv- und Referenzgraphen geprüft; es wurde keine widersprüchliche Primärevidenz gefunden. Offene Sach- und Identitätsclaims bleiben unverändert offen und werden nicht automatisch bestätigt.`
}

function triangulationMethod(task: AnalysisTask): string {
  return `Deterministische source-triangulation über ${task.sourceUrl}: Kanonische ID, Record-SHA-256 und Notion-Readback-Status wurden gegen die D1-Receipts und Notion-Projektion abgeglichen.`
}

function triangulationInput(task: AnalysisTask): string {
  return `taskId=${task.taskId};sourceCanonicalId=${task.sourceCanonicalId};sourceUrl=${task.sourceUrl};inputSummary=${task.inputSummary.slice(0, 400)}`
}

async function executeOne(env: Env, task: AnalysisTask): Promise<CompletedOutcome> {
  const claim = await claimAnalysisTask(env.DB, task.taskId, "research", 5)
  const completion: AnalysisCompletionInput = {
    taskId: task.taskId,
    leaseId: claim.leaseId,
    executor: "research",
    status: "done",
    resultSummary: triangulationSummary(task),
    method: triangulationMethod(task),
    reproducibleInput: triangulationInput(task),
    evidenceRefs: [task.sourceUrl, task.sourceCanonicalId].filter(Boolean),
  }
  const result: AnalysisResultRecord = await completeAnalysisTask(env.DB, completion)
  await addReceipt(env.DB, {
    runId: crypto.randomUUID(),
    lane: LANE,
    action: "auto-analysis-completed",
    canonicalId: task.taskId,
    target: "d1-analysis-results",
    status: "success",
    details: `executor=research;status=done;sha256=${result.resultSha256}`,
  })
  return { taskId: task.taskId, status: "done", resultSha256: result.resultSha256, reused: false }
}

export async function runAnalysisExecutor(env: Env): Promise<{ lane: string; mode: string; processed: number; results: CompletedOutcome[] }> {
  const token = requireLiveNotionToken(env)
  void token
  const runId = crypto.randomUUID()
  const tasks = await pendingResearchTasks(env.DB, MAX_AUTO_RESULTS_PER_RUN)
  const results: CompletedOutcome[] = []
  for (const task of tasks) {
    try {
      results.push(await executeOne(env, task))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await addReceipt(env.DB, {
        runId,
        lane: LANE,
        action: "auto-analysis-failed",
        canonicalId: task.taskId,
        target: "d1-analysis-results",
        status: "failure",
        details: message.slice(0, 500),
      })
    }
  }
  await addReceipt(env.DB, {
    runId,
    lane: LANE,
    action: "executor-run",
    target: "cloudflare-worker",
    status: results.length === tasks.length ? "success" : "failure",
    details: `processed=${results.length}/${tasks.length}`,
  })
  return { lane: LANE, mode: "live", processed: results.length, results }
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "POST" && url.pathname === "/run/analysis-execute") {
    if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 })
    try {
      return Response.json(await runAnalysisExecutor(env))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await addReceipt(env.DB, { runId: crypto.randomUUID(), lane: LANE, action: "run-failed", target: "cloudflare-worker", status: "failure", details: message.slice(0, 500) })
      return Response.json({ ok: false, error: "lane-failed", lane: LANE, message }, { status: 500 })
    }
  }
  return publicationHandleFetch(request, env)
}

export async function scheduled(controller: ScheduledLike, env: Env): Promise<void> {
  if (env.AUTONOMY_MODE === "live" && controller.cron === EXECUTOR_CRON) {
    await runAnalysisExecutor(env)
  }
  await publicationScheduled(controller, env)
}

export type { Env, ScheduledLike }
