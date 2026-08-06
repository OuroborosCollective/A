import { Worker } from "@notionhq/workers"

import { registerResearchTools } from "./tools.js"
import {
  runCommitBackfillPage,
  runCommitSyncPage,
  runFeedSyncPage,
  runReleaseSync,
  runWaybackSyncPage,
  type CommitBackfillState,
  type CommitSyncState,
  type FeedSyncState,
  type WaybackSyncState,
} from "./sync.js"
import {
  SIGNAL_PRIMARY_KEY,
  SOURCE_PRIMARY_KEY,
  signalSchema,
  sourceSchema,
} from "./schemas.js"

const worker = new Worker()

const githubPacer = worker.pacer("githubPublicApi", {
  allowedRequests: 50,
  intervalMs: 3_600_000,
})

const archivePacer = worker.pacer("internetArchive", {
  allowedRequests: 120,
  intervalMs: 3_600_000,
})

const feedPacer = worker.pacer("publicFeeds", {
  allowedRequests: 240,
  intervalMs: 3_600_000,
})

const sources = worker.database("researchSources", {
  type: "managed",
  initialTitle: "Satoshi & Bitcoin – Quellenarchiv",
  primaryKeyProperty: SOURCE_PRIMARY_KEY,
  schema: sourceSchema,
})

const hypeSignals = worker.database("hypeSignals", {
  type: "managed",
  initialTitle: "Bitcoin – Hype- und Aufmerksamkeitssignale",
  primaryKeyProperty: SIGNAL_PRIMARY_KEY,
  schema: signalSchema,
})

worker.sync("bitcoinCoreCommits", {
  database: sources,
  mode: "incremental",
  schedule: "15m",
  execute: (state: CommitSyncState | undefined) =>
    runCommitSyncPage(state, () => githubPacer.wait()),
})

worker.sync("bitcoinCoreCommitBackfill", {
  database: sources,
  mode: "incremental",
  schedule: "manual",
  execute: (state: CommitBackfillState | undefined) =>
    runCommitBackfillPage(state, () => githubPacer.wait()),
})

worker.sync("bitcoinCoreReleases", {
  database: sources,
  mode: "incremental",
  schedule: "1h",
  execute: () => runReleaseSync(() => githubPacer.wait()),
})

worker.sync("historicalWaybackCaptures", {
  database: sources,
  mode: "incremental",
  schedule: "6h",
  execute: (state: WaybackSyncState | undefined) =>
    runWaybackSyncPage(state, () => archivePacer.wait()),
})

worker.sync("bitcoinHypeFeeds", {
  database: hypeSignals,
  mode: "incremental",
  schedule: "15m",
  execute: (state: FeedSyncState | undefined) =>
    runFeedSyncPage(state, () => feedPacer.wait()),
})

registerResearchTools(worker)

export default worker
