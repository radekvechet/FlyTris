CREATE TABLE IF NOT EXISTS flytris_checkpoints (
  match_id TEXT PRIMARY KEY REFERENCES flytris_matches(id),
  run_id TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  state_json TEXT NOT NULL,
  last_batch_hash TEXT,
  accepted_at BIGINT NOT NULL,
  elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0 AND elapsed_ms <= 120000)
);
