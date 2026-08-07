import { FEEDS, type FeedDefinition } from "./config.js"
import { fetchFeed, type FeedItem } from "./adapters/feed.js"
import { canonicalSourceId, canonicalizeUrl } from "./domain/canonical.js"
import { sha256Hex, stableJson } from "./domain/hash.js"
import { calculateHype } from "./domain/research.js"
import type { HypeSignal } from "./domain/types.js"
import { NOTION_TARGETS } from "./consent.js"
import { upsertSignalToNotion } from "./notion-api.js"
import { addReceipt, getRecordMeta, getState, putState, rememberRecord } from "./storage.js"
import {
  handleFetch as mailingListHandleFetch,
  scheduled as mailingListScheduled,
  type Env,
  type ScheduledLike,
} from "./runtime-mailinglist-extension.js"

const LANE = "feeds"
const FEED_CRON = "*/30 * * * *"
export const FEED_BATCH_SIZE = 8
export const FEED_VISIBLE_LIMIT = 25

export interface FeedBudgetState {
  feedIndex?: number
  itemOffset?: number
}

export interface FeedWindowPlan {
  start: number
  end: number
  nextState: Required<FeedBudgetState>
  hasMore: boolean
}

export function planFeedWindow(
  state: FeedBudgetState | undefined,
  totalItems: number,
  feedCount = FEEDS.length
): FeedWindowPlan {
  const safeFeedCount = Math.max(1, Math.floor(feedCount))
  const feedIndex = Math.max(0, Math.min(safeFeedCount - 1, Math.floor(state?.feedIndex ?? 0)))
  const visibleTotal = Math.max(0, Math.min(FEED_VISIBLE_LIMIT, Math.floor(totalItems)))
  const start = Math.max(0, Math.min(visibleTotal, Math.floor(state?.itemOffset ?? 0)))
  const end = Math.min(visibleTotal, start + FEED_BATCH_SIZE)
  const completedFeed = end >= visibleTotal
  const nextFeedIndex = completedFeed ? (feedIndex + 1) % safeFeedCount : feedIndex
  return {
    start,
    end,
    nextState: { feedIndex: nextFeedIndex, itemOffset: completedFeed ? 0 : end },
    hasMore: !completedFeed || feedIndex + 1 < safeFeedCount,
  }
}

function mode(env: Env): "preview" | "live" {
  return env.AUTONOMY_MODE === "live" ? "live" : "preview"
}

function requireNotionToken(env: Env): string {
  const token = env.NOTION_API_TOKEN?.trim()
  if (!token) throw new Error("AUTONOMY_MODE=live requires NOTION_API_TOKEN")
  return token
}

function authorized(request: Request, env: Env): boolean {
  const configured = env.ADMIN_TOKEN?.trim()
  if (!configured) return false
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  return supplied === configured
}

async function feedItemToSignal(feed: FeedDefinition, item: FeedItem, retrievedAt: string): Promise<HypeSignal> {
  const haystack = `${item.title} ${item.summary}`.toLowerCase()
  const keywordMap: Array<[string, string]> = [
    ["satoshi", "Satoshi"], ["bitcoin", "Bitcoin"], ["btc", "BTC"], ["identity", "Identität"],
    ["etf", "ETF"], ["court", "Gericht"], ["wallet", "Wallet"],
  ]
  const keywords = keywordMap.filter(([needle]) => haystack.includes(needle)).map(([, label]) => label)
  const primaryEvidenceCount = feed.sourceClass === "technical" ? 1 : 0
  const baseMentions = Math.min(100, 20 + keywords.length * 12)
  const hype = calculateHype({
    mentionCount: Math.round(baseMentions * feed.weight),
    independentPublishers: 1,
    searchTrend: Math.round(35 * feed.weight),
    priceVolatility: 0,
    primaryEvidenceCount,
  })
  const canonicalLink = canonicalizeUrl(item.link)
  return {
    signalId: await canonicalSourceId("feed", `${feed.id}:${item.id}`, canonicalLink),
    title: item.title,
    source: feed.title,
    sourceUrl: canonicalLink,
    publishedAt: item.publishedAt,
    retrievedAt,
    summary: item.summary,
    keywords,
    hypeScore: hype.score,
    primaryEvidenceCount,
    evidenceGap: hype.evidenceGap,
    recordSha256: await sha256Hex(stableJson({ feed: feed.id, item })),
    adapter: "RSS/Atom",
  }
}

async function persistSignals(env: Env, runId: string, records: HypeSignal[]): Promise<void> {
  const currentMode = mode(env)
  let failures = 0
  for (const record of records) {
    try {
      const existing = await getRecordMeta(env.DB, record.signalId)
      await rememberRecord(env.DB, record.signalId, "signal", record.recordSha256, record)
      if (currentMode === "preview") {
        await addReceipt(env.DB, {
          runId,
          lane: LANE,
          action: "notion-upsert",
          canonicalId: record.signalId,
          target: NOTION_TARGETS.hype,
          status: "preview",
          details: "bounded-feed-preview",
        })
        continue
      }

      if (existing?.recordSha256 === record.recordSha256 && existing.notionPageId) {
        await addReceipt(env.DB, {
          runId,
          lane: LANE,
          action: "notion-signal-reused",
          canonicalId: record.signalId,
          target: NOTION_TARGETS.hype,
          status: "success",
          details: `page=${existing.notionPageId};unchanged_hash=true`,
        })
        continue
      }

      const pageId = await upsertSignalToNotion(requireNotionToken(env), record)
      await rememberRecord(env.DB, record.signalId, "signal", record.recordSha256, record, pageId)
      await addReceipt(env.DB, {
        runId,
        lane: LANE,
        action: "notion-upsert-readback",
        canonicalId: record.signalId,
        target: NOTION_TARGETS.hype,
        status: "success",
        details: `page=${pageId};bounded_batch=${FEED_BATCH_SIZE}`,
      })
    } catch (error) {
      failures += 1
      await addReceipt(env.DB, {
        runId,
        lane: LANE,
        action: "notion-upsert-readback",
        canonicalId: record.signalId,
        target: NOTION_TARGETS.hype,
        status: "failure",
        details: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      })
    }
  }
  if (failures) throw new Error(`${failures} signal record(s) failed in bounded feed lane`)
}

export async function runBoundedFeedLane(env: Env): Promise<{ lane: string; mode: string; count: number; hasMore: boolean }> {
  const runId = crypto.randomUUID()
  const currentMode = mode(env)
  await addReceipt(env.DB, {
    runId,
    lane: LANE,
    action: "run-start",
    target: "cloudflare-worker",
    status: currentMode === "live" ? "success" : "preview",
    details: `revision=${env.REVISION ?? "unknown"};batch=${FEED_BATCH_SIZE};visible_limit=${FEED_VISIBLE_LIMIT}`,
  })

  const state = await getState<FeedBudgetState>(env.DB, LANE)
  const feedIndex = Math.max(0, Math.min(FEEDS.length - 1, Math.floor(state?.feedIndex ?? 0)))
  const feed = FEEDS[feedIndex]
  if (!feed) throw new Error(`Feed index out of range: ${feedIndex}`)

  const items = await fetchFeed(feed.url)
  const plan = planFeedWindow(state, items.length, FEEDS.length)
  const retrievedAt = new Date().toISOString()
  const records = await Promise.all(items.slice(plan.start, plan.end).map((item) => feedItemToSignal(feed, item, retrievedAt)))
  await persistSignals(env, runId, records)

  if (currentMode === "live") await putState(env.DB, LANE, plan.nextState)
  return { lane: LANE, mode: currentMode, count: records.length, hasMore: plan.hasMore }
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "POST" && url.pathname === "/run/feeds") {
    if (!authorized(request, env)) return new Response("Unauthorized", { status: 401 })
    try {
      return Response.json(await runBoundedFeedLane(env))
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
  }
  return mailingListHandleFetch(request, env)
}

export async function scheduled(controller: ScheduledLike, env: Env): Promise<void> {
  if (controller.cron === FEED_CRON) {
    await runBoundedFeedLane(env)
    return
  }
  await mailingListScheduled(controller, env)
}

export type { Env, ScheduledLike }
