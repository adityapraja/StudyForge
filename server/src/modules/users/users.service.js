import { DateTime } from 'luxon';
import { query } from '../../db.js';
import { AppError } from '../../middleware/error-handler.js';
import { formatUser } from '../auth/auth.service.js';

export const updateUserProfile = async (userId, data) => {
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (data.username !== undefined) {
    const { rows: existing } = await query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2`,
      [data.username, userId]
    );
    if (existing.length > 0) {
      throw new AppError(409, 'USERNAME_TAKEN', 'This username is already taken');
    }
    updates.push(`username = $${paramIndex++}`);
    values.push(data.username);
  }

  if (data.time_zone !== undefined) {
    updates.push(`time_zone = $${paramIndex++}`);
    values.push(data.time_zone);
  }

  if (data.category !== undefined) {
    updates.push(`category = $${paramIndex++}`);
    values.push(data.category);
  }

  if (data.leaderboard_hidden !== undefined) {
    updates.push(`leaderboard_hidden = $${paramIndex++}`);
    values.push(data.leaderboard_hidden);
  }

  if (data.privacy !== undefined) {
    // Merge existing privacy settings with new keys
    updates.push(`privacy = privacy || $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(data.privacy));
  }

  if (updates.length === 0) {
    const { rows } = await query(
      `SELECT id, email, username, time_zone, category, leaderboard_hidden,
              privacy, xp, level, streak_minimum_minutes
       FROM users WHERE id = $1`,
      [userId]
    );
    return formatUser(rows[0]);
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  const { rows } = await query(
    `UPDATE users
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING id, email, username, time_zone, category, leaderboard_hidden,
               privacy, xp, level, streak_minimum_minutes`,
    values
  );

  return formatUser(rows[0]);
};

export const getUserGoalsWithProgress = async (user) => {
  const zone = user.time_zone || 'UTC';
  const now = DateTime.now().setZone(zone);
  const today = now.toISODate();
  const startOfWeek = now.startOf('week').toISODate(); // Monday
  const endOfWeek = now.endOf('week').toISODate();     // Sunday

  // Get today's total study seconds
  const { rows: todayRows } = await query(
    `SELECT minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
    [user.id, today]
  );
  const todaySeconds = todayRows.length > 0 ? todayRows[0].minutes * 60 : 0;

  // Get week's total study seconds
  const { rows: weekRows } = await query(
    `SELECT COALESCE(SUM(minutes), 0) AS week_minutes
     FROM daily_totals
     WHERE user_id = $1 AND day >= $2 AND day <= $3`,
    [user.id, startOfWeek, endOfWeek]
  );
  const weekSeconds = parseInt(weekRows[0].week_minutes, 10) * 60;

  return {
    daily_target_seconds: user.daily_target_seconds,
    weekly_target_seconds: user.weekly_target_seconds,
    streak_minimum_minutes: user.streak_minimum_minutes,
    today_seconds: todaySeconds,
    week_seconds: weekSeconds,
  };
};

export const updateUserGoals = async (
  userId,
  { daily_target_seconds, weekly_target_seconds, streak_minimum_minutes }
) => {
  const { rows } = await query(
    `UPDATE users
     SET daily_target_seconds = $1,
         weekly_target_seconds = $2,
         streak_minimum_minutes = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING daily_target_seconds, weekly_target_seconds, streak_minimum_minutes`,
    [daily_target_seconds, weekly_target_seconds, streak_minimum_minutes, userId]
  );

  return {
    daily_target_seconds: rows[0].daily_target_seconds,
    weekly_target_seconds: rows[0].weekly_target_seconds,
    streak_minimum_minutes: rows[0].streak_minimum_minutes,
  };
};

