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

export interface SyncPage<T, S> {
  records: T[]
  hasMore: boolean
  nextState: S
}

export interface CommitSyncState {
  cursor?: string
  page?: number
  windowStart?: string
  windowEnd?: string
}

export async function collectCommitPage(
  state: CommitSyncState | undefined,
  githubToken?: string
): Promise<SyncPage<ResearchSource, CommitSyncState>> {
  const now = Date.now()
  const windowEnd = state?.windowEnd ?? new Date(now - 30_000).toISOString()
  const windowStart = state?.windowStart ?? state?.cursor ?? new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const page = state?.page ?? 1
  const result = await fetchBitcoinCoreCommits({ since: windowStart, until: windowEnd, page, perPage: 10, token: githubToken })
  const retrievedAt = new Date().toISOString()
  const records = await Promise.all(result.commits.map((commit) => commitToSource(commit, retrievedAt)))

  if (result.hasMore) {
    return { records, hasMore: true, nextState: { ...state, page: page + 1, windowStart, windowEnd } }
  }
  const overlapCursor = new Date(new Date(windowEnd).valueOf() - 120_000).toISOString()
  return { records, hasMore: false, nextState: { cursor: overlapCursor } }
}

export interface CommitBackfillState { page?: number; windowEnd?: string }

export async function collectCommitBackfillPage(
  state: CommitBackfillState | undefined,
  githubToken?: string
): Promise<SyncPage<ResearchSource, CommitBackfillState>> {
  const page = state?.page ?? 1
  const windowEnd = state?.windowEnd ?? new Date(Date.now() - 30_000).toISOString()
  const result = await fetchBitcoinCoreCommits({
    since: "2009-01-01T00:00:00.000Z",
    until: windowEnd,
    page,
    perPage: 10,
    token: githubToken,
  })
  const retrievedAt = new Date().toISOString()
  const records = await Promise.all(result.commits.map((commit) => commitToSource(commit, retrievedAt)))
  return { records, hasMore: result.hasMore, nextState: result.hasMore ? { page: page + 1, windowEnd } : { page: 1 } }
}

export async function collectReleasePage(githubToken?: string): Promise<SyncPage<ResearchSource, { cursor: string }>> {
  const releases = await fetchBitcoinCoreReleases(githubToken)
  const retrievedAt = new Date().toISOString()
  const records = await Promise.all(releases.map((release) => releaseToSource(release, retrievedAt)))
  const latest = releases.map((release) => release.updated_at).sort().at(-1) ?? retrievedAt
  return { records, hasMore: false, nextState: { cursor: latest } }
}

export interface WaybackSyncState { seedIndex?: number }

export async function collectWaybackPage(
  state: WaybackSyncState | undefined
): Promise<SyncPage<ResearchSource, WaybackSyncState>> {
  const seedIndex = state?.seedIndex ?? 0
  const seed = WAYBACK_SEEDS[seedIndex]
  if (!seed) return { records: [], hasMore: false, nextState: { seedIndex: 0 } }
  const captures = await fetchWaybackCaptures(seed)
  const retrievedAt = new Date().toISOString()
  const records = await Promise.all(captures.slice(0, 25).map((capture) => captureToSource(capture, retrievedAt)))
  const nextIndex = seedIndex + 1
  return {
    records,
    hasMore: nextIndex < WAYBACK_SEEDS.length,
    nextState: { seedIndex: nextIndex < WAYBACK_SEEDS.length ? nextIndex : 0 },
  }
}

export interface FeedSyncState { feedIndex?: number }

export async function collectFeedPage(
  state: FeedSyncState | undefined
): Promise<SyncPage<HypeSignal, FeedSyncState>> {
  const feedIndex = state?.feedIndex ?? 0
  const feed = FEEDS[feedIndex]
  if (!feed) return { records: [], hasMore: false, nextState: { feedIndex: 0 } }
  const items = await fetchFeed(feed.url)
  const retrievedAt = new Date().toISOString()
  const records = await Promise.all(items.slice(0, 25).map((item) => feedItemToSignal(feed, item, retrievedAt)))
  const nextIndex = feedIndex + 1
  return {
    records,
    hasMore: nextIndex < FEEDS.length,
    nextState: { feedIndex: nextIndex < FEEDS.length ? nextIndex : 0 },
  }
}

async function commitToSource(commit: GitHubCommit, retrievedAt: string): Promise<ResearchSource> {
  const publishedAt = commit.commit.committer?.date ?? commit.commit.author?.date
  const title = commit.commit.message.split("\n")[0]?.trim() || commit.sha
  return {
    canonicalId: await canonicalSourceId("github-commit", commit.sha, commit.html_url),
    title,
    lane: "Bitcoin Core",
    sourceType: "Code-Commit",
    evidenceTier: "Primär belegt",
    originalUrl: canonicalizeUrl(commit.html_url),
    publishedAt,
    retrievedAt,
    upstreamId: commit.sha,
    recordSha256: await sha256Hex(stableJson(commit)),
    contentHashVerified: false,
    adapter: "GitHub REST",
    status: "Erfasst",
    subjects: ["Bitcoin", "Technik", "Historie"],
    summary: commit.commit.message,
    primarySource: true,
    independentConfirmations: 0,
  }
}

async function releaseToSource(release: GitHubRelease, retrievedAt: string): Promise<ResearchSource> {
  const title = release.name?.trim() || release.tag_name
  return {
    canonicalId: await canonicalSourceId("github-release", String(release.id), release.html_url),
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
    subjects: ["Bitcoin", "Technik", "Historie"],
    summary: release.body?.trim() || `${release.tag_name}; Autor: ${release.author.login}`,
    primarySource: true,
    independentConfirmations: 0,
  }
}

async function captureToSource(capture: WaybackCapture, retrievedAt: string): Promise<ResearchSource> {
  const archiveUrl = waybackSnapshotUrl(capture)
  return {
    canonicalId: await canonicalSourceId("wayback-cdx", `${capture.timestamp}:${capture.digest}`, archiveUrl),
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
    subjects: ["Satoshi", "Bitcoin", "Historie"],
    summary: `HTTP ${capture.statuscode}; MIME ${capture.mimetype}; CDX-Digest ${capture.digest}.`,
    primarySource: false,
    independentConfirmations: 1,
  }
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
