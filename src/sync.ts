import type { SyncChangeUpsert } from "@notionhq/workers"

import { FEEDS, WAYBACK_SEEDS, type FeedDefinition } from "./config.js"
import { fetchFeed, type FeedItem } from "./adapters/feed.js"
import {
  fetchBitcoinCoreCommits,
  fetchBitcoinCoreReleases,
  type GitHubCommit,
  type GitHubRelease,
} from "./adapters/github.js"
import {
  fetchWaybackCaptures,
  waybackSnapshotUrl,
  waybackTimestampToIso,
  type WaybackCapture,
} from "./adapters/wayback.js"
import { canonicalSourceId, canonicalizeUrl } from "./domain/canonical.js"
import { sha256Hex, stableJson } from "./domain/hash.js"
import { calculateHype } from "./domain/research.js"
import type { HypeSignal, ResearchSource } from "./domain/types.js"
import {
  SIGNAL_PRIMARY_KEY,
  SOURCE_PRIMARY_KEY,
  signalSchema,
  signalToChange,
  sourceSchema,
  sourceToChange,
} from "./schemas.js"

export type SourceChange = SyncChangeUpsert<
  typeof SOURCE_PRIMARY_KEY,
  typeof sourceSchema.properties
>
export type SignalChange = SyncChangeUpsert<
  typeof SIGNAL_PRIMARY_KEY,
  typeof signalSchema.properties
>

export interface CommitSyncState {
  cursor?: string
  page?: number
  windowStart?: string
  windowEnd?: string
}

export async function runCommitSyncPage(
  state: CommitSyncState | undefined,
  wait: () => Promise<void>
): Promise<{
  changes: SourceChange[]
  hasMore: boolean
  nextState: CommitSyncState
}> {
  const now = Date.now()
  const windowEnd = state?.windowEnd ?? new Date(now - 30_000).toISOString()
  const windowStart =
    state?.windowStart ??
    state?.cursor ??
    new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const page = state?.page ?? 1

  await wait()
  const result = await fetchBitcoinCoreCommits({
    since: windowStart,
    until: windowEnd,
    page,
  })
  const retrievedAt = new Date().toISOString()
  const sources = await Promise.all(result.commits.map((commit) => commitToSource(commit, retrievedAt)))

  if (result.hasMore) {
    return {
      changes: sources.map(sourceToChange),
      hasMore: true,
      nextState: { ...state, page: page + 1, windowStart, windowEnd },
    }
  }

  const overlapCursor = new Date(new Date(windowEnd).valueOf() - 120_000).toISOString()
  return {
    changes: sources.map(sourceToChange),
    hasMore: false,
    nextState: { cursor: overlapCursor },
  }
}

export interface CommitBackfillState {
  page?: number
  windowEnd?: string
}

export async function runCommitBackfillPage(
  state: CommitBackfillState | undefined,
  wait: () => Promise<void>
): Promise<{
  changes: SourceChange[]
  hasMore: boolean
  nextState: CommitBackfillState
}> {
  const page = state?.page ?? 1
  const windowEnd = state?.windowEnd ?? new Date(Date.now() - 30_000).toISOString()
  await wait()
  const result = await fetchBitcoinCoreCommits({
    since: "2009-01-01T00:00:00.000Z",
    until: windowEnd,
    page,
  })
  const retrievedAt = new Date().toISOString()
  const sources = await Promise.all(result.commits.map((commit) => commitToSource(commit, retrievedAt)))
  return {
    changes: sources.map(sourceToChange),
    hasMore: result.hasMore,
    nextState: result.hasMore ? { page: page + 1, windowEnd } : { page: 1 },
  }
}

export async function runReleaseSync(wait: () => Promise<void>): Promise<{
  changes: SourceChange[]
  hasMore: false
  nextState: { cursor: string }
}> {
  await wait()
  const releases = await fetchBitcoinCoreReleases()
  const retrievedAt = new Date().toISOString()
  const sources = await Promise.all(releases.map((release) => releaseToSource(release, retrievedAt)))
  const latest = releases.map((release) => release.updated_at).sort().at(-1) ?? retrievedAt
  return {
    changes: sources.map(sourceToChange),
    hasMore: false,
    nextState: { cursor: latest },
  }
}

export interface WaybackSyncState {
  seedIndex?: number
}

export async function runWaybackSyncPage(
  state: WaybackSyncState | undefined,
  wait: () => Promise<void>
): Promise<{
  changes: SourceChange[]
  hasMore: boolean
  nextState: WaybackSyncState
}> {
  const seedIndex = state?.seedIndex ?? 0
  const seed = WAYBACK_SEEDS[seedIndex]
  if (!seed) return { changes: [], hasMore: false, nextState: { seedIndex: 0 } }

  await wait()
  const captures = await fetchWaybackCaptures(seed)
  const retrievedAt = new Date().toISOString()
  const sources = await Promise.all(captures.map((capture) => captureToSource(capture, retrievedAt)))
  const nextIndex = seedIndex + 1
  return {
    changes: sources.map(sourceToChange),
    hasMore: nextIndex < WAYBACK_SEEDS.length,
    nextState: { seedIndex: nextIndex < WAYBACK_SEEDS.length ? nextIndex : 0 },
  }
}

export interface FeedSyncState {
  feedIndex?: number
}

export async function runFeedSyncPage(
  state: FeedSyncState | undefined,
  wait: () => Promise<void>
): Promise<{
  changes: SignalChange[]
  hasMore: boolean
  nextState: FeedSyncState
}> {
  const feedIndex = state?.feedIndex ?? 0
  const feed = FEEDS[feedIndex]
  if (!feed) return { changes: [], hasMore: false, nextState: { feedIndex: 0 } }

  await wait()
  const items = await fetchFeed(feed.url)
  const retrievedAt = new Date().toISOString()
  const signals = await Promise.all(items.slice(0, 100).map((item) => feedItemToSignal(feed, item, retrievedAt)))
  const nextIndex = feedIndex + 1
  return {
    changes: signals.map(signalToChange),
    hasMore: nextIndex < FEEDS.length,
    nextState: { feedIndex: nextIndex < FEEDS.length ? nextIndex : 0 },
  }
}

async function commitToSource(commit: GitHubCommit, retrievedAt: string): Promise<ResearchSource> {
  const publishedAt = commit.commit.committer?.date ?? commit.commit.author?.date
  const title = commit.commit.message.split("\n")[0]?.trim() || commit.sha
  const canonicalId = await canonicalSourceId("github-commit", commit.sha, commit.html_url)
  const recordSha256 = await sha256Hex(stableJson(commit))
  return {
    canonicalId,
    title,
    lane: "Bitcoin Core",
    sourceType: "Code-Commit",
    evidenceTier: "Primär belegt",
    originalUrl: canonicalizeUrl(commit.html_url),
    publishedAt,
    retrievedAt,
    upstreamId: commit.sha,
    recordSha256,
    contentHashVerified: false,
    adapter: "GitHub REST",
    status: "Erfasst",
    subjects: ["Bitcoin Core", "Code-Historie"],
    summary: commit.commit.message,
    primarySource: true,
    independentConfirmations: 0,
  }
}

async function releaseToSource(release: GitHubRelease, retrievedAt: string): Promise<ResearchSource> {
  const title = release.name?.trim() || release.tag_name
  const canonicalId = await canonicalSourceId("github-release", String(release.id), release.html_url)
  return {
    canonicalId,
    title,
    lane: "Bitcoin Core",
    sourceType: "Software-Release",
    evidenceTier: "Primär belegt",
    originalUrl: canonicalizeUrl(release.html_url),
    publishedAt: release.published_at ?? release.created_at,
    retrievedAt,
    upstreamId: String(release.id),
    recordSha256: await sha256Hex(stableJson(release)),
    contentHashVerified: false,
    adapter: "GitHub REST",
    status: "Erfasst",
    subjects: ["Bitcoin Core", "Release"],
    summary: release.body?.trim() || `${release.tag_name}; Autor: ${release.author.login}`,
    primarySource: true,
    independentConfirmations: 0,
  }
}

async function captureToSource(capture: WaybackCapture, retrievedAt: string): Promise<ResearchSource> {
  const archiveUrl = waybackSnapshotUrl(capture)
  const canonicalId = await canonicalSourceId(
    "wayback-cdx",
    `${capture.timestamp}:${capture.digest}`,
    archiveUrl
  )
  return {
    canonicalId,
    title: `Archivcapture ${capture.original} – ${capture.timestamp}`,
    lane: "Historische Webarchive",
    sourceType: "Webarchiv-Capture",
    evidenceTier: "Unabhängig archiviert",
    originalUrl: canonicalizeUrl(capture.original),
    archiveUrl,
    publishedAt: waybackTimestampToIso(capture.timestamp),
    retrievedAt,
    upstreamId: `${capture.timestamp}:${capture.original}`,
    upstreamDigest: capture.digest,
    recordSha256: await sha256Hex(stableJson(capture)),
    contentHashVerified: false,
    adapter: "Internet Archive CDX",
    status: "In Prüfung",
    subjects: ["Satoshi Nakamoto", "Bitcoin", "Webarchiv"],
    summary: `HTTP ${capture.statuscode}; MIME ${capture.mimetype}; CDX-Digest ${capture.digest}.`,
    primarySource: false,
    independentConfirmations: 1,
  }
}

async function feedItemToSignal(
  feed: FeedDefinition,
  item: FeedItem,
  retrievedAt: string
): Promise<HypeSignal> {
  const haystack = `${item.title} ${item.summary}`.toLowerCase()
  const keywords = ["satoshi", "bitcoin", "btc", "nakamoto", "identity", "etf", "court", "wallet"]
    .filter((keyword) => haystack.includes(keyword))
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
  const signalId = await canonicalSourceId("feed", `${feed.id}:${item.id}`, canonicalLink)
  return {
    signalId,
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
