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

DO $migration$
BEGIN
  IF to_regclass('public.daily_goals') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'daily_goals'
         AND column_name = 'target_minutes'
     ) THEN
    EXECUTE $sql$
      INSERT INTO planner_days (user_id, date, reflection)
      SELECT user_id, date, reflection
      FROM daily_goals
      ON CONFLICT (user_id, date)
      DO UPDATE SET
        reflection = COALESCE(planner_days.reflection, EXCLUDED.reflection),
        updated_at = NOW()
    $sql$;

    EXECUTE $sql$
      INSERT INTO planner_goals (user_id, date, text, target_seconds)
      SELECT old_goal.user_id, old_goal.date, 'Daily goal', old_goal.target_minutes * 60
      FROM daily_goals old_goal
      WHERE NOT EXISTS (
        SELECT 1 FROM planner_goals new_goal
        WHERE new_goal.user_id = old_goal.user_id AND new_goal.date = old_goal.date
      )
    $sql$;
  END IF;
END
$migration$;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS carried_from_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_carry_over_once
  ON tasks(user_id, date, carried_from_task_id)
  WHERE carried_from_task_id IS NOT NULL;

-- Reconstruct subject totals from ended sessions, reconciling each day with
-- its persisted daily total so the historical daily cap remains authoritative.
WITH session_segments AS (
  SELECT   s.id AS session_id,
  s.user_id,
  s.subject_id,
  s.study_seconds,
  s.verified,
         calendar.local_day::date AS day,
         GREATEST(
           s.started_at,
           calendar.local_day::date::timestamp AT TIME ZONE users.time_zone
         ) AS segment_start,
         LEAST(
           s.ended_at,
           (calendar.local_day::date + 1)::timestamp AT TIME ZONE users.time_zone
         ) AS segment_end
  FROM sessions s
  JOIN users ON users.id = s.user_id
  CROSS JOIN LATERAL generate_series(
    (s.started_at AT TIME ZONE users.time_zone)::date::timestamp,
    (s.ended_at AT TIME ZONE users.time_zone)::date::timestamp,
    INTERVAL '1 day'
  ) AS calendar(local_day)
  WHERE s.ended_at IS NOT NULL
    AND s.study_seconds IS NOT NULL
),
segment_weights AS (
  SELECT *,
         EXTRACT(EPOCH FROM (segment_end - segment_start))::numeric AS wall_seconds
  FROM session_segments
  WHERE segment_end > segment_start
),
weighted_sessions AS (
  SELECT *,
         SUM(wall_seconds) OVER (PARTITION BY session_id) AS total_wall_seconds,
         ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY day) AS day_index,
         COUNT(*) OVER (PARTITION BY session_id) AS day_count
  FROM segment_weights
),
rounded_segments AS (
  SELECT *,
         ROUND(study_seconds * wall_seconds / NULLIF(total_wall_seconds, 0)) AS proportional_seconds
  FROM weighted_sessions
),
allocated_segments AS (
  SELECT *,
         SUM(proportional_seconds) OVER (PARTITION BY session_id) AS rounded_total_seconds
  FROM rounded_segments
),
subject_raw AS (
  SELECT user_id,
         subject_id,
         day,
         SUM(
           FLOOR(
             CASE
               WHEN day_index = day_count
                 THEN study_seconds - (rounded_total_seconds - proportional_seconds)
               ELSE proportional_seconds
             END / 60
           )
         )::integer AS raw_minutes,
         SUM(
           CASE WHEN verified THEN FLOOR(
             CASE
               WHEN day_index = day_count
                 THEN study_seconds - (rounded_total_seconds - proportional_seconds)
               ELSE proportional_seconds
             END / 60
           ) ELSE 0 END
         )::integer AS raw_verified_minutes
  FROM allocated_segments
  GROUP BY user_id, subject_id, day
),
subject_totals AS (
  SELECT subject_raw.*,
         daily_totals.minutes AS target_minutes,
         daily_totals.verified_minutes AS target_verified_minutes,
         SUM(raw_minutes) OVER (PARTITION BY subject_raw.user_id, subject_raw.day) AS total_raw_minutes,
         SUM(raw_verified_minutes) OVER (PARTITION BY subject_raw.user_id, subject_raw.day) AS total_raw_verified_minutes
  FROM subject_raw
  JOIN daily_totals
    ON daily_totals.user_id = subject_raw.user_id
   AND daily_totals.day = subject_raw.day
),
scaled_subjects AS (
  SELECT *,
         CASE WHEN total_raw_minutes > 0
           THEN raw_minutes::numeric * target_minutes / total_raw_minutes
           ELSE 0 END AS ideal_minutes,
         CASE WHEN total_raw_verified_minutes > 0
           THEN raw_verified_minutes::numeric * target_verified_minutes / total_raw_verified_minutes
           ELSE 0 END AS ideal_verified_minutes
  FROM subject_totals
),
base_allocations AS (
  SELECT *,
         FLOOR(ideal_minutes)::integer AS base_minutes,
         FLOOR(ideal_verified_minutes)::integer AS base_verified_minutes,
         ideal_minutes - FLOOR(ideal_minutes) AS minute_fraction,
         ideal_verified_minutes - FLOOR(ideal_verified_minutes) AS verified_fraction
  FROM scaled_subjects
),
ranked_allocations AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, day ORDER BY minute_fraction DESC, subject_id
         ) AS minute_rank,
         target_minutes - SUM(base_minutes) OVER (PARTITION BY user_id, day) AS remaining_minutes,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, day ORDER BY verified_fraction DESC, subject_id
         ) AS verified_rank,
         target_verified_minutes - SUM(base_verified_minutes) OVER (PARTITION BY user_id, day) AS remaining_verified_minutes
  FROM base_allocations
)
INSERT INTO subject_daily_totals (user_id, subject_id, day, minutes, verified_minutes)
SELECT user_id,
       subject_id,
       day,
       base_minutes + CASE WHEN minute_rank <= remaining_minutes THEN 1 ELSE 0 END,
       base_verified_minutes + CASE WHEN verified_rank <= remaining_verified_minutes THEN 1 ELSE 0 END
FROM ranked_allocations
WHERE base_minutes > 0
   OR base_verified_minutes > 0
   OR minute_rank <= remaining_minutes
   OR verified_rank <= remaining_verified_minutes
ON CONFLICT (user_id, subject_id, day) DO NOTHING;