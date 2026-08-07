# Notion Worker deployment and readback

This repository is designed to fail closed. A successful Git commit or build is not evidence that a Notion Worker is deployed or operating correctly.

## Platform prerequisite

Notion Workers are available on Business and Enterprise workspaces and must be enabled by a workspace owner. Do not attempt to bypass this platform gate.

## GitHub environment

Create a protected GitHub Actions environment named `notion-production` and configure these secrets there:

- `NOTION_API_TOKEN` — a Notion token accepted by the official `ntn` CLI.
- `NOTION_WORKSPACE_ID` — the target workspace identifier. Keep it in the protected environment rather than committing it to this public repository.

Recommended environment protection: require an owner review before deployment.

## Deployment workflow

Run **Notion Worker Deploy + Readback** manually.

1. Leave `deploy=false` for a verification-only run.
2. Set `deploy=true` to deploy after `npm run verify` passes.
3. Keep `trigger_live_syncs=false` for the first deployment. The workflow deploys, reads back capabilities, and previews the selected syncs without database writes.
4. Only after the preview output is correct, run again with `trigger_live_syncs=true` to execute the selected live syncs.

The deployment job is bound to the exact checked-out Git revision and reruns verification on the same runner before calling `ntn workers deploy --name satoshi-bitcoin-research`.

## Evidence required for green state

A runtime green state requires all of the following:

- exact Git revision recorded;
- dependency installation succeeded;
- TypeScript check and tests succeeded;
- `ntn workers deploy` succeeded;
- `ntn workers capabilities list` returned the expected capabilities;
- source and hype sync previews succeeded;
- `ntn workers sync status` returned without error;
- if live syncs were requested, each trigger succeeded;
- managed Notion databases are then read back and sampled for expected canonical IDs, hashes, provenance fields, and evidence classifications.

Do not describe the worker as live merely because the GitHub workflow completed before the Notion-side readback is performed.

## Current capability keys

- `bitcoinCoreCommits`
- `bitcoinCoreCommitBackfill` (manual historical backfill; deliberately not triggered by the standard production workflow)
- `bitcoinCoreReleases`
- `historicalWaybackCaptures`
- `bitcoinHypeFeeds`
- `deriveResearchPaths`
- `assessEvidence`
- `calculateHype`
- `canonicalSourceId`

## Rollback

Worker code is Git-revisioned. If a deployment regresses, redeploy a previously verified commit. Do not reset sync state unless the recovery procedure explicitly requires a full re-ingestion; deployment itself should preserve sync cursors.
