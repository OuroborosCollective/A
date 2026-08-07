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

CREATE TABLE IF NOT EXISTS analysis_queue (
  task_id TEXT PRIMARY KEY,
  source_canonical_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  executor TEXT NOT NULL CHECK (executor IN ('research','wolfram')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','done','blocked')),
  requires_human_review INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analysis_queue_status ON analysis_queue(status, executor, created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_queue_source ON analysis_queue(source_canonical_id, created_at);

CREATE TABLE IF NOT EXISTS analysis_claims (
  task_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL UNIQUE,
  executor TEXT NOT NULL CHECK (executor IN ('research','wolfram')),
  claimed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES analysis_queue(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analysis_claims_expiry ON analysis_claims(expires_at);

CREATE TABLE IF NOT EXISTS analysis_results (
  task_id TEXT PRIMARY KEY,
  executor TEXT NOT NULL CHECK (executor IN ('research','wolfram')),
  status TEXT NOT NULL CHECK (status IN ('done','blocked')),
  result_summary TEXT NOT NULL,
  method TEXT NOT NULL,
  reproducible_input TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  result_sha256 TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES analysis_queue(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analysis_results_executor ON analysis_results(executor, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_results_status ON analysis_results(status, completed_at DESC);
