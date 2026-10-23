ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS disqualified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS session_disqualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('session', 'user_day')),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  day DATE,
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('confirmed_invalid_session', 'confirmed_day_tampering')),
  confirmed_by VARCHAR(255) NOT NULL,
  confirmation_reference VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (scope = 'session' AND session_id IS NOT NULL AND day IS NULL
      AND reason = 'confirmed_invalid_session')
    OR
    (scope = 'user_day' AND session_id IS NULL AND day IS NOT NULL
      AND reason = 'confirmed_day_tampering')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_disqualifications_session
  ON session_disqualifications(session_id) WHERE scope = 'session';
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_disqualifications_user_day
  ON session_disqualifications(user_id, day) WHERE scope = 'user_day';

CREATE TABLE IF NOT EXISTS session_day_credits (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  original_verified_minutes INTEGER NOT NULL CHECK (original_verified_minutes >= 0),
  verified_minutes INTEGER NOT NULL CHECK (
    verified_minutes >= 0 AND verified_minutes <= original_verified_minutes
  ),
  original_leaderboard_credited_seconds INTEGER NOT NULL CHECK (
    original_leaderboard_credited_seconds >= 0
    AND original_leaderboard_credited_seconds = original_verified_minutes * 60
  ),
  leaderboard_credited_seconds INTEGER NOT NULL CHECK (
    leaderboard_credited_seconds >= 0
    AND leaderboard_credited_seconds <= original_leaderboard_credited_seconds
    AND leaderboard_credited_seconds = verified_minutes * 60
  ),
  credited_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  disqualification_id UUID REFERENCES session_disqualifications(id),
  PRIMARY KEY (session_id, day),
  CHECK (
    (leaderboard_credited_seconds = 0 AND credited_at IS NULL)
    OR (leaderboard_credited_seconds > 0 AND credited_at IS NOT NULL)
    OR (revoked_at IS NOT NULL AND credited_at IS NOT NULL)
  ),
  CHECK (
    (disqualification_id IS NULL AND revoked_at IS NULL)
    OR (disqualification_id IS NOT NULL AND revoked_at IS NOT NULL
      AND verified_minutes = 0 AND leaderboard_credited_seconds = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_session_day_credits_user_day
  ON session_day_credits(user_id, day, credited_at)
  WHERE leaderboard_credited_seconds > 0;

ALTER TABLE xp_events
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE xp_events
  ADD COLUMN IF NOT EXISTS disqualification_id UUID;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.xp_events'::regclass
      AND c.confrelid = 'public.session_disqualifications'::regclass
      AND a.attname = 'disqualification_id'
  ) THEN
    ALTER TABLE xp_events
      ADD CONSTRAINT xp_events_disqualification_fk
      FOREIGN KEY (disqualification_id)
      REFERENCES session_disqualifications(id);
  END IF;
END
$migration$;
