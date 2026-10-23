-- Study Habit Tracker Schema
-- Plain PostgreSQL (gen_random_uuid() is built-in in PostgreSQL 13+)

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
  -- pgcrypto not strictly needed since gen_random_uuid() is native in PG 13+
  NULL;
END $$;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  username VARCHAR(50) NOT NULL,
  time_zone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  category VARCHAR(50) NOT NULL DEFAULT 'college' CHECK (category IN ('school', 'college', 'competitive_exams', 'professional')),
  leaderboard_hidden BOOLEAN NOT NULL DEFAULT false,
  privacy JSONB NOT NULL DEFAULT '{"weekly_time": "friends", "subjects": "friends"}'::jsonb,
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  daily_target_seconds INTEGER NOT NULL DEFAULT 14400 CHECK (daily_target_seconds >= 0),
  weekly_target_seconds INTEGER NOT NULL DEFAULT 72000 CHECK (weekly_target_seconds >= 0),
  streak_minimum_minutes INTEGER NOT NULL DEFAULT 15 CHECK (streak_minimum_minutes >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_email ON users(LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_username ON users(LOWER(username));

-- 2. Subjects
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  color VARCHAR(7) NOT NULL CHECK (color ~* '^#[0-9a-fA-F]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id);

-- 3. Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'on_break', 'ended')),
  paused_seconds INTEGER NOT NULL DEFAULT 0 CHECK (paused_seconds >= 0),
  break_seconds INTEGER NOT NULL DEFAULT 0 CHECK (break_seconds >= 0),
  segment_started_at TIMESTAMPTZ NOT NULL,
  study_seconds INTEGER CHECK (study_seconds IS NULL OR study_seconds >= 0),
  note VARCHAR(200),
  source VARCHAR(20) NOT NULL DEFAULT 'timer' CHECK (source IN ('timer', 'manual')),
  verified BOOLEAN NOT NULL DEFAULT true,
  leaderboard_credited_seconds INTEGER NOT NULL DEFAULT 0 CHECK (leaderboard_credited_seconds >= 0),
  leaderboard_credited_at TIMESTAMPTZ,
  disqualified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

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

CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions(user_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_user_open ON sessions(user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_leaderboard_credit
  ON sessions(leaderboard_credited_at, user_id)
  WHERE source = 'timer' AND verified = true AND status = 'ended'
    AND leaderboard_credited_seconds > 0;

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

-- 4. Daily Totals
CREATE TABLE IF NOT EXISTS daily_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  verified_minutes INTEGER NOT NULL DEFAULT 0 CHECK (verified_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_totals_day_user ON daily_totals(day, user_id);

-- Per-subject daily totals stay aligned with the same local-day and daily-cap
-- accounting used by the session-end transaction.
CREATE TABLE IF NOT EXISTS subject_daily_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  verified_minutes INTEGER NOT NULL DEFAULT 0 CHECK (verified_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, subject_id, day)
);

CREATE INDEX IF NOT EXISTS idx_subject_daily_totals_user_day
  ON subject_daily_totals(user_id, day);

-- 5. Streaks
CREATE TABLE IF NOT EXISTS streaks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current INTEGER NOT NULL DEFAULT 0 CHECK (current >= 0),
  longest INTEGER NOT NULL DEFAULT 0 CHECK (longest >= 0),
  freeze_week VARCHAR(20),
  freezes_used INTEGER NOT NULL DEFAULT 0 CHECK (freezes_used >= 0),
  last_counted_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. XP Events
CREATE TABLE IF NOT EXISTS xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  reference_id VARCHAR(255),
  kind VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  day DATE NOT NULL,
  reversed_at TIMESTAMPTZ,
  disqualification_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE xp_events ADD COLUMN IF NOT EXISTS reference_id VARCHAR(255);
ALTER TABLE xp_events ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE xp_events ADD COLUMN IF NOT EXISTS disqualification_id UUID;

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

CREATE INDEX IF NOT EXISTS idx_xp_events_user ON xp_events(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_session_kind
  ON xp_events(session_id, kind) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_daily_goal
  ON xp_events(user_id, day) WHERE kind = 'daily_goal';
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_topic_done
  ON xp_events(user_id, reference_id) WHERE kind = 'topic_done';

-- 7. Planner Days and Goals
CREATE TABLE IF NOT EXISTS planner_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reflection VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS planner_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  text VARCHAR(200) NOT NULL,
  target_seconds INTEGER NOT NULL CHECK (target_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_goals_user_date ON planner_goals(user_id, date);

-- 8. Tasks (Planner)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  carried_from_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  text VARCHAR(200) NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  carried_over BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_carry_over_once
  ON tasks(user_id, date, carried_from_task_id)
  WHERE carried_from_task_id IS NOT NULL;

-- 9. Syllabus Topics
CREATE TABLE IF NOT EXISTS syllabus_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES syllabus_topics(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syllabus_subject ON syllabus_topics(subject_id);

-- 10. Exams
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  target_hours NUMERIC(6, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_user ON exams(user_id);

-- 11. Friendships
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, receiver_id),
  CONSTRAINT friendships_not_self CHECK (requester_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON friendships(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friendships_pending_receiver
  ON friendships(receiver_id, created_at) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_accepted_pair
  ON friendships(LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id))
  WHERE status = 'accepted';

-- 12. Blocks
CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CONSTRAINT blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id, blocker_id);
