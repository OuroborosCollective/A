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
