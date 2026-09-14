CREATE TABLE IF NOT EXISTS flytris_request_limits (
  client_key TEXT PRIMARY KEY,
  window_start BIGINT NOT NULL,
  request_count INTEGER NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS flytris_request_limits_expiry ON flytris_request_limits (expires_at);
