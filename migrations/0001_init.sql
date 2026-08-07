CREATE TABLE IF NOT EXISTS sync_state (
  lane TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  canonical_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('source','signal')),
  record_sha256 TEXT NOT NULL,
  notion_page_id TEXT,
  payload_json TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_kind_seen ON records(kind, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS action_receipts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lane TEXT NOT NULL,
  action TEXT NOT NULL,
  canonical_id TEXT,
  target TEXT NOT NULL,
  authority_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','failure','preview')),
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipts_run ON action_receipts(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON action_receipts(status, created_at DESC);
