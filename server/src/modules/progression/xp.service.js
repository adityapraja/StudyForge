import { config } from '../../config.js';
import { query } from '../../db.js';

export const BONUS_XP_DAILY_GOAL = 50;
export const BONUS_XP_TOPIC_DONE = 20;

/**
 * Calculates level and progress breakdown for a given total XP.
 * Level 1 requires 200 XP.
 * Each subsequent level requires 50 more XP than the previous level:
 * Level 1 -> 2: 200 XP
 * Level 2 -> 3: 250 XP
 * Level 3 -> 4: 300 XP
 * Level 4 -> 5: 350 XP
 * Level 5 -> 6: 400 XP
 * (Example: at 1240 XP, level is 5, xp_in_level is 140, xp_for_next_level is 400)
 */
export const getXpBreakdown = (totalXp) => {
  const xp = Math.max(0, totalXp || 0);

  let currentLevel = 1;
  let accumulatedXp = 0;
  let neededForNext = 200;

  while (xp >= accumulatedXp + neededForNext) {
    accumulatedXp += neededForNext;
    currentLevel += 1;
    neededForNext = 200 + (currentLevel - 1) * 50;
  }

  const xpInLevel = xp - accumulatedXp;

  return {
    xp,
    level: currentLevel,
    xp_in_level: xpInLevel,
    xp_for_next_level: neededForNext,
  };
};

/**
 * Calculates XP earned from a study session.
 * 1 XP per focused minute.
 * Manual or unverified sessions earn 0 XP.
 * Capped at 4 hours (240 XP).
 */
export const calculateSessionXp = (studySeconds, isVerified = true) => {
  if (!isVerified || studySeconds <= 0) {
    return 0;
  }

  const focusedMinutes = Math.floor(studySeconds / 60);
  const maxXp = config.sessionXpCapHours * 60; // 240 XP

  return Math.min(maxXp, focusedMinutes);
};

/**
 * Awards 50 XP bonus for meeting the daily study goal.
 * Awarded at most once per user per local calendar day.
 * Idempotent via unique partial index idx_xp_events_daily_goal.
 */
export const awardDailyGoalXp = async (client, userId, day) => {
  const { rows: eventRows } = await client.query(
    `INSERT INTO xp_events (user_id, kind, amount, day)
     VALUES ($1, 'daily_goal', $2, $3)
     ON CONFLICT (user_id, day) WHERE kind = 'daily_goal'
     DO NOTHING
     RETURNING id`,
    [userId, BONUS_XP_DAILY_GOAL, day]
  );

  if (eventRows.length === 0) {
    return {
      awarded: false,
      xp: 0,
      reason: 'ALREADY_AWARDED',
    };
  }

  const { rows: userRows } = await client.query(
    `SELECT xp, level FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );

  const prevXp = userRows[0]?.xp || 0;
  const prevLevel = userRows[0]?.level || 1;
  const newXp = prevXp + BONUS_XP_DAILY_GOAL;
  const { level: newLevel } = getXpBreakdown(newXp);

  await client.query(
    `UPDATE users SET xp = $1, level = $2, updated_at = NOW() WHERE id = $3`,
    [newXp, newLevel, userId]
  );

  return {
    awarded: true,
    xp: BONUS_XP_DAILY_GOAL,
    new_xp: newXp,
    new_level: newLevel,
    level_up: newLevel > prevLevel,
  };
};

/**
 * Exported hook for Person C's Syllabus module:
 * Awards 20 XP bonus per completed syllabus topic.
 * Awarded at most once per user per topic (no double awards on retries / toggles).
 * Idempotent via unique partial index idx_xp_events_topic_done.
 */
export const awardTopicCompletionXp = async (client, userId, topicId, day = null) => {
  const effectiveDay = day || new Date().toISOString().slice(0, 10);

  const { rows: eventRows } = await client.query(
    `INSERT INTO xp_events (user_id, kind, reference_id, amount, day)
     VALUES ($1, 'topic_done', $2, $3, $4)
     ON CONFLICT (user_id, reference_id) WHERE kind = 'topic_done'
     DO NOTHING
     RETURNING id`,
    [userId, String(topicId), BONUS_XP_TOPIC_DONE, effectiveDay]
  );

  if (eventRows.length === 0) {
    return {
      awarded: false,
      xp: 0,
      reason: 'ALREADY_AWARDED',
    };
  }

  const { rows: userRows } = await client.query(
    `SELECT xp, level FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );

  const prevXp = userRows[0]?.xp || 0;
  const prevLevel = userRows[0]?.level || 1;
  const newXp = prevXp + BONUS_XP_TOPIC_DONE;
  const { level: newLevel } = getXpBreakdown(newXp);

  await client.query(
    `UPDATE users SET xp = $1, level = $2, updated_at = NOW() WHERE id = $3`,
    [newXp, newLevel, userId]
  );

  return {
    awarded: true,
    xp: BONUS_XP_TOPIC_DONE,
    new_xp: newXp,
    new_level: newLevel,
    level_up: newLevel > prevLevel,
  };
};

/**
 * Awards session XP to user.
 * 1 XP per minute, max 240 XP. Manual / unverified earn 0 XP.
 * Idempotent via unique partial index idx_xp_events_session_kind.
 */
export const awardSessionXp = async (client, userId, sessionId, studySeconds, isVerified, day) => {
  const sessionXp = calculateSessionXp(studySeconds, isVerified);
  if (sessionXp <= 0) {
    return { awarded: false, xp: 0 };
  }

  const { rows: eventRows } = await client.query(
    `INSERT INTO xp_events (user_id, session_id, kind, amount, day)
     VALUES ($1, $2, 'session', $3, $4)
     ON CONFLICT (session_id, kind) WHERE session_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [userId, sessionId, sessionXp, day]
  );

  if (eventRows.length === 0) {
    return { awarded: false, xp: 0, reason: 'ALREADY_AWARDED' };
  }

  const { rows: userRows } = await client.query(
    `SELECT xp, level FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );

  const prevXp = userRows[0]?.xp || 0;
  const prevLevel = userRows[0]?.level || 1;
  const newXp = prevXp + sessionXp;
  const { level: newLevel } = getXpBreakdown(newXp);

  await client.query(
    `UPDATE users SET xp = $1, level = $2, updated_at = NOW() WHERE id = $3`,
    [newXp, newLevel, userId]
  );

  return {
    awarded: true,
    xp: sessionXp,
    new_xp: newXp,
    new_level: newLevel,
    level_up: newLevel > prevLevel,
  };
};

/**
 * Retrieves the user's XP event history with cursor-based pagination.
 */
export const getUserXpEvents = async (userId, { limit = 50, cursor } = {}) => {
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit || '50', 10)));
  const conditions = ['user_id = $1'];
  const values = [userId];
  let paramIndex = 2;

  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const { created_at, id } = JSON.parse(decoded);
      conditions.push(`(created_at, id) < ($${paramIndex++}, $${paramIndex++})`);
      values.push(new Date(created_at), id);
    } catch {
      // Invalid cursor ignored
    }
  }

  values.push(safeLimit + 1);
  const sql = `
    SELECT id, session_id, reference_id, kind, amount, day::text, created_at
    FROM xp_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT $${paramIndex}
  `;

  const { rows } = await query(sql, values);

  let nextCursor = null;
  if (rows.length > safeLimit) {
    const last = rows[safeLimit - 1];
    nextCursor = Buffer.from(
      JSON.stringify({ created_at: last.created_at, id: last.id }),
      'utf8'
    ).toString('base64');
    rows.pop();
  }

  return {
    items: rows.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      reference_id: row.reference_id,
      kind: row.kind,
      amount: row.amount,
      day: row.day,
      created_at: row.created_at,
    })),
    next_cursor: nextCursor,
  };
};
