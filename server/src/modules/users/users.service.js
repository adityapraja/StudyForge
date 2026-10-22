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

  // Get week's daily totals
  const { rows: dailyRows } = await query(
    `SELECT day::text, minutes
     FROM daily_totals
     WHERE user_id = $1 AND day >= $2 AND day <= $3`,
    [user.id, startOfWeek, endOfWeek]
  );
  const minutesByDay = new Map(dailyRows.map((r) => [r.day, r.minutes]));

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekStartDt = now.startOf('week');
  const dailyTarget = user.daily_target_seconds ?? 14400;
  const weeklyTarget = user.weekly_target_seconds ?? 72000;

  let daysGoalMet = 0;
  const days = [];

  for (let i = 0; i < 7; i++) {
    const currentDayDt = weekStartDt.plus({ days: i });
    const dateStr = currentDayDt.toISODate();
    const dayName = dayNames[i];
    const mins = minutesByDay.get(dateStr) || 0;
    const seconds = mins * 60;
    const goalMet = seconds >= dailyTarget;

    if (goalMet) {
      daysGoalMet++;
    }

    days.push({
      day: dayName,
      date: dateStr,
      seconds,
      target_seconds: dailyTarget,
      goal_met: goalMet,
    });
  }

  const todayMins = minutesByDay.get(today) || 0;
  const todaySeconds = todayMins * 60;
  const weekSeconds = days.reduce((acc, d) => acc + d.seconds, 0);

  const todayProgressPercent = dailyTarget > 0
    ? Math.min(100, Math.round((todaySeconds / dailyTarget) * 100))
    : 0;
  const weekProgressPercent = weeklyTarget > 0
    ? Math.min(100, Math.round((weekSeconds / weeklyTarget) * 100))
    : 0;

  return {
    daily_target_seconds: dailyTarget,
    weekly_target_seconds: weeklyTarget,
    streak_minimum_minutes: user.streak_minimum_minutes,
    today_seconds: todaySeconds,
    week_seconds: weekSeconds,
    today_progress_percent: todayProgressPercent,
    daily_goal_met: todaySeconds >= dailyTarget,
    days,
    days_goal_met: daysGoalMet,
    week_progress_percent: weekProgressPercent,
    weekly_goal_met: weekSeconds >= weeklyTarget,
  };
};

export const getWeeklyGoalsBreakdown = async (user) => {
  return getUserGoalsWithProgress(user);
};

export const updateUserGoals = async (userId, data) => {
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (data.daily_target_seconds !== undefined) {
    updates.push(`daily_target_seconds = $${paramIndex++}`);
    values.push(data.daily_target_seconds);
  }

  if (data.weekly_target_seconds !== undefined) {
    updates.push(`weekly_target_seconds = $${paramIndex++}`);
    values.push(data.weekly_target_seconds);
  }

  if (data.streak_minimum_minutes !== undefined) {
    updates.push(`streak_minimum_minutes = $${paramIndex++}`);
    values.push(data.streak_minimum_minutes);
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  const { rows } = await query(
    `UPDATE users
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING daily_target_seconds, weekly_target_seconds, streak_minimum_minutes`,
    values
  );

  return {
    daily_target_seconds: rows[0].daily_target_seconds,
    weekly_target_seconds: rows[0].weekly_target_seconds,
    streak_minimum_minutes: rows[0].streak_minimum_minutes,
  };
};

