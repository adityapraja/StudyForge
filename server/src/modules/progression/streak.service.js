import { DateTime } from 'luxon';
import { query } from '../../db.js';

/**
 * Gets streak info for the given user, matching the GET /me/streak contract.
 */
export const getStreakInfo = async (userId, userTimeZone, streakMinimumMinutes) => {
  const zone = userTimeZone || 'UTC';
  const now = DateTime.now().setZone(zone);
  const today = now.toISODate();
  const currentWeek = now.toFormat("kkkk-'W'WW");

  // Get current streak record with date formatted as string
  const { rows: streakRows } = await query(
    `SELECT current, longest, freeze_week, freezes_used,
            TO_CHAR(last_counted_date, 'YYYY-MM-DD') AS last_counted_date
     FROM streaks
     WHERE user_id = $1`,
    [userId]
  );

  const streak = streakRows[0] || {
    current: 0,
    longest: 0,
    freeze_week: null,
    freezes_used: 0,
    last_counted_date: null,
  };

  // Get today's logged minutes
  const { rows: todayRows } = await query(
    `SELECT minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
    [userId, today]
  );

  const todayMinutes = todayRows.length > 0 ? todayRows[0].minutes : 0;
  const todayCounted = todayMinutes >= streakMinimumMinutes;
  const freezeAvailable = streak.freeze_week !== currentWeek;

  // Determine active current streak (taking into account missed days)
  let activeCurrent = streak.current;
  if (streak.last_counted_date) {
    const lastDate = DateTime.fromISO(streak.last_counted_date, { zone });
    const diffDays = Math.round(now.startOf('day').diff(lastDate.startOf('day'), 'days').days);

    if (diffDays === 0 || diffDays === 1) {
      // Studied today or yesterday: streak is active
      activeCurrent = streak.current;
    } else if (diffDays === 2) {
      // Missed yesterday: if freeze is available, streak is preserved pending today
      if (!freezeAvailable) {
        activeCurrent = 0;
      }
    } else if (diffDays > 2) {
      // Missed 2 or more days: streak has reset
      activeCurrent = 0;
    }
  }

  return {
    current: activeCurrent,
    longest: streak.longest,
    today_minutes: todayMinutes,
    minimum_minutes: streakMinimumMinutes,
    today_counted: todayCounted,
    freeze_available: freezeAvailable,
  };
};

/**
 * Updates streak inside a transaction after a session ends.
 * Only extends streak if today's total study minutes >= streakMinimumMinutes.
 */
export const updateStreakOnSessionEnd = async (
  client,
  userId,
  userTimeZone,
  streakMinimumMinutes,
  sessionEndDate
) => {
  const zone = userTimeZone || 'UTC';
  const endDateTime = DateTime.fromJSDate(sessionEndDate, { zone });
  const sessionDay = endDateTime.toISODate();
  const currentWeek = endDateTime.toFormat("kkkk-'W'WW");

  // Get total minutes for session day
  const { rows: totalsRows } = await client.query(
    `SELECT minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
    [userId, sessionDay]
  );

  const dayMinutes = totalsRows.length > 0 ? totalsRows[0].minutes : 0;

  // Lock streak record
  const { rows: streakRows } = await client.query(
    `SELECT current, longest, freeze_week, freezes_used,
            TO_CHAR(last_counted_date, 'YYYY-MM-DD') AS last_counted_date
     FROM streaks
     WHERE user_id = $1
     FOR UPDATE`,
    [userId]
  );

  if (streakRows.length === 0) {
    return { current: 0, longest: 0 };
  }

  const streak = streakRows[0];
  let current = streak.current;
  let longest = streak.longest;
  let freezeWeek = streak.freeze_week;
  let freezesUsed = streak.freezes_used;
  let lastCountedDate = streak.last_counted_date || null;

  // Only evaluate streak extension if minimum minutes target is reached for this day
  if (dayMinutes >= streakMinimumMinutes) {
    if (lastCountedDate === sessionDay) {
      // Already counted this day towards the streak
      return { current, longest };
    }

    if (!lastCountedDate) {
      // First time reaching daily minimum
      current = 1;
      lastCountedDate = sessionDay;
    } else {
      const lastDate = DateTime.fromISO(lastCountedDate, { zone });
      const diffDays = Math.round(
        endDateTime.startOf('day').diff(lastDate.startOf('day'), 'days').days
      );

      if (diffDays === 1) {
        // Consecutive calendar day
        current += 1;
        lastCountedDate = sessionDay;
      } else if (diffDays === 2) {
        // Missed exactly 1 day. Check if weekly freeze is available
        if (freezeWeek !== currentWeek) {
          // Freeze applies automatically
          freezeWeek = currentWeek;
          freezesUsed += 1;
          current += 1; // Preserved and extended
          lastCountedDate = sessionDay;
        } else {
          // Freeze already used this week -> streak resets
          current = 1;
          lastCountedDate = sessionDay;
        }
      } else {
        // Missed 2 or more days -> streak resets
        current = 1;
        lastCountedDate = sessionDay;
      }
    }

    longest = Math.max(longest, current);

    await client.query(
      `UPDATE streaks
       SET current = $1, longest = $2, freeze_week = $3, freezes_used = $4,
           last_counted_date = $5, updated_at = NOW()
       WHERE user_id = $6`,
      [current, longest, freezeWeek, freezesUsed, lastCountedDate, userId]
    );
  }

  return { current, longest };
};

