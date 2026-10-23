ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS leaderboard_credited_seconds INTEGER NOT NULL DEFAULT 0
    CHECK (leaderboard_credited_seconds >= 0);

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS leaderboard_credited_at TIMESTAMPTZ;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_leaderboard_credit_eligible'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_leaderboard_credit_eligible
      CHECK (
        (leaderboard_credited_seconds = 0 AND leaderboard_credited_at IS NULL)
        OR (
          leaderboard_credited_seconds > 0
          AND leaderboard_credited_at IS NOT NULL
          AND source = 'timer'
          AND verified = true
          AND status = 'ended'
          AND ended_at IS NOT NULL
          AND study_seconds IS NOT NULL
          AND leaderboard_credited_seconds <= study_seconds
        )
      ) NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE sessions VALIDATE CONSTRAINT sessions_leaderboard_credit_eligible;

CREATE INDEX IF NOT EXISTS idx_sessions_leaderboard_credit
  ON sessions(leaderboard_credited_at, user_id)
  WHERE source = 'timer' AND verified = true AND status = 'ended'
    AND leaderboard_credited_seconds > 0;
