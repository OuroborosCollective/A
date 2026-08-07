# Free Cloudflare + Notion deployment and readback

The runtime deliberately avoids Notion Workers. It uses Cloudflare Workers Free, D1 Free and the standard Notion REST API.

## Required secrets

Use a protected GitHub Actions environment named `cloudflare-production`.

Required for Cloudflare deploy:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Required only when enabling Notion writes:

- `NOTION_API_TOKEN` — token of a normal Notion internal integration that has access only to the Satoshi research archive targets.

Optional:

- `ADMIN_TOKEN` — protects manual `/run/*` HTTP calls. If absent, manual runs fail closed; Cron continues to work.

Secrets never belong in repository files or chat transcripts.

## Deployment sequence

Run **Cloudflare Free Research Runtime** manually.

1. `deploy=false`: verification only.
2. `deploy=true`, `activate_notion_writes=false`: resolve/create D1, migrate it and deploy the exact revision in `preview` mode. Public sources may be fetched and D1 receipts may be written, but Notion is not mutated.
3. After preview evidence is acceptable, run `deploy=true`, `activate_notion_writes=true`. The workflow installs the Notion secret and redeploys the same exact revision with `AUTONOMY_MODE=live`.

The D1 database is resolved by the fixed name `satoshi-research`; its ID is injected into a generated Wrangler config during the workflow and never needs to be committed.

## Standing authority

`research-archive-v1` permits public reads plus upsert/readback only in these two Notion Data Sources:

- `a7569cee-15e1-4847-845c-5317614ce370` — Quellen- und Entitätenarchiv
- `9edf6d9c-8164-4263-adb7-b59229e920ac` — BTC Hype & Aufmerksamkeitssignale

The runtime has no delete/archive operation and no generic Notion target parameter. A changed target ID is rejected by code.

## Free-plan operating envelope

The runtime is designed for four Cron Triggers and small batches. Cloudflare Free currently permits five Cron Triggers per account, 100,000 Worker requests/day and 50 subrequests per invocation. D1 Free currently includes 5 million rows read/day, 100,000 rows written/day and 5 GB total storage. These are platform limits, not a promise that every research source will remain below its own external rate limits.

## Runtime green state

Do not call the runtime green until all applicable evidence exists:

- exact Git revision;
- CI success on that revision;
- Cloudflare deploy success;
- D1 tables `sync_state`, `records`, `action_receipts` read back;
- Worker `/health` reports the same revision and expected mode;
- at least one source lane runs successfully;
- in live mode, the resulting Notion page is retrieved again;
- canonical ID and record hash match expected values;
- only then is `Readback geprüft` set true.

## Rollback

Redeploy a previously verified Git revision in `preview` mode first. D1 cursors are not deleted during rollback. Notion records are never bulk-deleted by this runtime.
