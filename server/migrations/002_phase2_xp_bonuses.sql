-- Phase 2: Bonus XP rules & Idempotency Constraints
ALTER TABLE xp_events
  ADD COLUMN IF NOT EXISTS reference_id VARCHAR(255);

-- Ensure a user can only receive session XP once per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_session_kind
  ON xp_events(session_id, kind)
  WHERE session_id IS NOT NULL;

-- 50 XP bonus for meeting daily goal is awarded at most once per user per calendar day
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_daily_goal
  ON xp_events(user_id, day)
  WHERE kind = 'daily_goal';

-- 20 XP bonus per completed syllabus topic is awarded at most once per user per topic
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_topic_done
  ON xp_events(user_id, reference_id)
  WHERE kind = 'topic_done';

