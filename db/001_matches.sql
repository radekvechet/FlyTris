CREATE TABLE IF NOT EXISTS flytris_matches (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  rules_version INTEGER NOT NULL DEFAULT 1,
  model_hash TEXT NOT NULL,
  seed BIGINT NOT NULL,
  started_at BIGINT NOT NULL,
  completed_at BIGINT,
  player_name TEXT NOT NULL DEFAULT 'anonymous',
  elapsed_ms INTEGER,
  human_lines INTEGER CHECK (human_lines >= 0),
  human_pieces INTEGER CHECK (human_pieces >= 0),
  fly_lines INTEGER CHECK (fly_lines >= 0),
  fly_pieces INTEGER CHECK (fly_pieces >= 0),
  winner TEXT CHECK (winner IN ('human','fly','draw')),
  reason TEXT CHECK (reason IN ('time','human-topout','fly-topout'))
);
CREATE INDEX IF NOT EXISTS flytris_matches_window ON flytris_matches (rules_version, difficulty, completed_at);
