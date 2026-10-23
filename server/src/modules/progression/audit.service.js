<<<<<<< HEAD
import { DateTime } from 'luxon';
import { query } from '../../db.js';
import { config } from '../../config.js';
import { splitSessionAcrossDays } from '../sessions/session-end.transaction.js';

const assertPositiveInteger = (value, name) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
};

const getUserLocalToday = (userId, timeZone, now) => {
  const localNow = DateTime.fromJSDate(now, { zone: timeZone });
  if (!localNow.isValid) {
    throw new Error(`User ${userId} has an invalid stored time zone.`);
  }
  return localNow.startOf('day');
};

const dayKey = (userId, day) => `${userId}:${day}`;

=======
import { query } from '../../db.js';
import { config } from '../../config.js';

/**
 * Audit service for detecting suspicious study habit activities and anti-cheat enforcement.
 * Implements Person B Phase 3 commitment for Gate 2 anti-cheat review and nightly checks.
 */

/**
 * Finds days where a user's logged study time is suspiciously high or saturated at the cap.
 * Default threshold: 14 hours (840 minutes), approaching the 16-hour (960 min) cap.
 *
 * @param {Object} options
 * @param {number} [options.thresholdMinutes=840] - Daily minute threshold to flag as suspicious
 * @param {number} [options.lookbackDays=30] - Lookback window in days
 * @param {number} [options.limit=100] - Max rows returned
 * @returns {Promise<Array>} List of suspicious day records
 */
>>>>>>> origin/main
export const findSuspiciousDays = async ({
  thresholdMinutes = 840,
  lookbackDays = 30,
  limit = 100,
} = {}) => {
<<<<<<< HEAD
  assertPositiveInteger(thresholdMinutes, 'thresholdMinutes');
  assertPositiveInteger(lookbackDays, 'lookbackDays');
  assertPositiveInteger(limit, 'limit');

  const capMinutes = config.dailyCapHours * 60;
  const { rows } = await query(
    `SELECT dt.user_id, u.username, u.email, dt.day::text AS day,
            dt.minutes, dt.verified_minutes,
            (dt.minutes - dt.verified_minutes) AS manual_unverified_minutes,
            CASE
              WHEN dt.minutes >= $1 THEN 'DAILY_CAP_SATURATION'
              WHEN dt.minutes >= $2 THEN 'HIGH_VOLUME_SUSPICIOUS'
              WHEN (dt.minutes - dt.verified_minutes) > 480 THEN 'EXCESSIVE_MANUAL_ENTRIES'
              ELSE 'ELEVATED_ACTIVITY'
            END AS flag
     FROM daily_totals dt
     JOIN users u ON u.id = dt.user_id
     WHERE dt.day >= CURRENT_DATE - ($3 * INTERVAL '1 day')
       AND (dt.minutes >= $2 OR (dt.minutes - dt.verified_minutes) > 480)
     ORDER BY dt.day DESC, dt.minutes DESC
     LIMIT $4`,
    [capMinutes, thresholdMinutes, lookbackDays, limit]
  );
=======
  const capMinutes = config.dailyCapHours * 60; // default 960 (16h)

  const sql = `
    SELECT
      dt.user_id,
      u.username,
      u.email,
      dt.day::text AS day,
      dt.minutes,
      dt.verified_minutes,
      (dt.minutes - dt.verified_minutes) AS manual_unverified_minutes,
      CASE
        WHEN dt.minutes >= $1 THEN 'DAILY_CAP_SATURATION'
        WHEN dt.minutes >= $2 THEN 'HIGH_VOLUME_SUSPICIOUS'
        WHEN (dt.minutes - dt.verified_minutes) > 480 THEN 'EXCESSIVE_MANUAL_ENTRIES'
        ELSE 'ELEVATED_ACTIVITY'
      END AS flag
    FROM daily_totals dt
    JOIN users u ON u.id = dt.user_id
    WHERE dt.day >= CURRENT_DATE - ($3 * INTERVAL '1 day')
      AND (
        dt.minutes >= $2
        OR (dt.minutes - dt.verified_minutes) > 480
      )
    ORDER BY dt.day DESC, dt.minutes DESC
    LIMIT $4
  `;

  const { rows } = await query(sql, [
    capMinutes,
    thresholdMinutes,
    lookbackDays,
    limit,
  ]);
>>>>>>> origin/main

  return rows.map((row) => ({
    user_id: row.user_id,
    username: row.username,
    email: row.email,
    day: row.day,
<<<<<<< HEAD
    minutes: Number.parseInt(row.minutes, 10),
    verified_minutes: Number.parseInt(row.verified_minutes, 10),
    manual_unverified_minutes: Number.parseInt(row.manual_unverified_minutes, 10),
=======
    minutes: parseInt(row.minutes, 10),
    verified_minutes: parseInt(row.verified_minutes, 10),
    manual_unverified_minutes: parseInt(row.manual_unverified_minutes, 10),
>>>>>>> origin/main
    flag: row.flag,
  }));
};

<<<<<<< HEAD
export const findConsecutiveHighVolumeDays = async ({
  thresholdMinutes = 840,
  consecutiveDays = 2,
  lookbackDays = 30,
  limit = 100,
  now = new Date(),
} = {}) => {
  assertPositiveInteger(thresholdMinutes, 'thresholdMinutes');
  assertPositiveInteger(consecutiveDays, 'consecutiveDays');
  assertPositiveInteger(lookbackDays, 'lookbackDays');
  assertPositiveInteger(limit, 'limit');

  const { rows } = await query(
    `SELECT dt.user_id, u.username, u.time_zone, dt.day::text AS day, dt.minutes
     FROM daily_totals dt
     JOIN users u ON u.id = dt.user_id
     WHERE dt.minutes >= $1
       AND dt.day BETWEEN CURRENT_DATE - ($2 + 2) AND CURRENT_DATE + 2
     ORDER BY dt.user_id, dt.day`,
    [thresholdMinutes, lookbackDays]
  );

  const daysByUser = new Map();
  for (const row of rows) {
    const today = getUserLocalToday(row.user_id, row.time_zone, now);
    const localDay = DateTime.fromISO(row.day, { zone: row.time_zone });
    if (!localDay.isValid) {
      throw new Error(`Invalid local date in daily totals for user ${row.user_id}.`);
    }
    if (localDay < today.minus({ days: lookbackDays }) || localDay > today) continue;

    if (!daysByUser.has(row.user_id)) {
      daysByUser.set(row.user_id, {
        username: row.username,
        days: [],
      });
    }
    daysByUser.get(row.user_id).days.push({
      date: localDay,
      minutes: Number.parseInt(row.minutes, 10),
    });
  }

  const findings = [];
  for (const [userId, value] of daysByUser) {
    const highVolumeDays = value.days.sort(
      (left, right) => left.date.toMillis() - right.date.toMillis()
    );
    let streakStart = null;
    let previousDay = null;
    let streak = [];

    const emitStreak = () => {
      if (streak.length >= consecutiveDays) {
        findings.push({
          user_id: userId,
          username: value.username,
          start_day: streak[0].date.toISODate(),
          end_day: streak[streak.length - 1].date.toISODate(),
          consecutive_days: streak.length,
          threshold_minutes: thresholdMinutes,
          flag: 'HIGH_VOLUME_CONSECUTIVE_DAYS',
        });
      }
      streak = [];
      streakStart = null;
    };

    for (const entry of highVolumeDays) {
      if (
        previousDay
        && entry.date.toISODate() !== previousDay.plus({ days: 1 }).toISODate()
      ) {
        emitStreak();
      }
      if (!streakStart) streakStart = entry.date;
      streak.push(entry);
      previousDay = entry.date;
    }
    if (streakStart) emitStreak();
  }

  return findings
    .sort((left, right) =>
      right.end_day.localeCompare(left.end_day) || left.user_id.localeCompare(right.user_id)
    )
    .slice(0, limit);
};

export const auditSessionDiscrepancies = async ({
  lookbackDays = 7,
  toleranceMinutes = 1,
  now = new Date(),
} = {}) => {
  assertPositiveInteger(lookbackDays, 'lookbackDays');
  if (!Number.isInteger(toleranceMinutes) || toleranceMinutes < 0) {
    throw new TypeError('toleranceMinutes must be a non-negative integer.');
  }

  const { rows: sessions } = await query(
    `SELECT s.user_id, u.username, u.time_zone, s.started_at, s.ended_at,
            s.study_seconds, s.verified, s.disqualified_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'ended'
       AND s.ended_at IS NOT NULL
       AND s.study_seconds IS NOT NULL
       AND s.started_at >= NOW() - (($1 + 2) * INTERVAL '1 day')`,
    [lookbackDays]
  );
  const { rows: disqualifiedDays } = await query(
    `SELECT user_id, day::text AS day
     FROM session_disqualifications
     WHERE scope = 'user_day'
       AND day >= CURRENT_DATE - (($1 + 2) * INTERVAL '1 day')
       AND day <= CURRENT_DATE + 2`,
    [lookbackDays]
  );
  const disqualifiedDayKeys = new Set(
    disqualifiedDays.map((row) => dayKey(row.user_id, row.day))
  );

  const sessionMinutes = new Map();
  const userZones = new Map();
  for (const session of sessions) {
    userZones.set(session.user_id, {
      username: session.username,
      timeZone: session.time_zone,
    });
    const localToday = getUserLocalToday(session.user_id, session.time_zone, now);
    const startedAt = DateTime.fromJSDate(session.started_at, { zone: session.time_zone });
    if (!startedAt.isValid) {
      throw new Error(`Invalid session timestamp for user ${session.user_id}.`);
    }
    if (startedAt > localToday.endOf('day')) continue;

    const segments = splitSessionAcrossDays(
      session.started_at,
      session.ended_at,
      Number(session.study_seconds || 0),
      session.time_zone
    );
    let accumulatedSeconds = 0;
    for (const segment of segments) {
      const previousWholeMinutes = Math.floor(accumulatedSeconds / 60);
      accumulatedSeconds += segment.studySeconds;
      const segmentMinutes =
        Math.floor(accumulatedSeconds / 60) - previousWholeMinutes;
      const key = dayKey(session.user_id, segment.day);
      const entry = sessionMinutes.get(key) || {
        user_id: session.user_id,
        username: session.username,
        day: segment.day,
        session_verified_mins: 0,
      };
      const localDay = DateTime.fromISO(segment.day, { zone: session.time_zone });
      if (
        localDay >= localToday.minus({ days: lookbackDays })
        && localDay <= localToday
        && session.verified
        && !session.disqualified_at
        && !disqualifiedDayKeys.has(key)
      ) {
        entry.session_verified_mins += segmentMinutes;
      }
      sessionMinutes.set(key, entry);
    }
  }

  const { rows: dailyTotals } = await query(
    `SELECT dt.user_id, u.username, u.time_zone,
            dt.day::text AS day, dt.verified_minutes
     FROM daily_totals dt
     JOIN users u ON u.id = dt.user_id
     WHERE dt.day >= CURRENT_DATE - (($1 + 2) * INTERVAL '1 day')
       AND dt.day <= CURRENT_DATE + 2`,
    [lookbackDays]
  );
  for (const row of dailyTotals) {
    userZones.set(row.user_id, {
      username: row.username,
      timeZone: row.time_zone,
    });
  }

  const dailyByKey = new Map(
    dailyTotals.map((row) => [dayKey(row.user_id, row.day), Number(row.verified_minutes)])
  );
  const comparisonKeys = new Set([...sessionMinutes.keys(), ...dailyByKey.keys()]);
  const findings = [];
  for (const key of comparisonKeys) {
    const [userId, day] = key.split(':');
    const user = userZones.get(userId);
    if (!user) continue;
    const localToday = getUserLocalToday(userId, user.timeZone, now);
    const localDay = DateTime.fromISO(day, { zone: user.timeZone });
    if (
      !localDay.isValid
      || localDay < localToday.minus({ days: lookbackDays })
      || localDay > localToday
    ) {
      continue;
    }

    const sessionVerifiedMins = sessionMinutes.get(key)?.session_verified_mins || 0;
    const dailyVerifiedMins = disqualifiedDayKeys.has(key)
      ? 0
      : dailyByKey.get(key) || 0;
    const delta = Math.abs(sessionVerifiedMins - dailyVerifiedMins);
    if (delta > toleranceMinutes) {
      findings.push({
        user_id: userId,
        username: user.username,
        day,
        session_verified_mins: sessionVerifiedMins,
        daily_totals_verified_mins: dailyVerifiedMins,
        delta_verified: delta,
        flag: 'DATA_DRIFT',
      });
    }
  }

  return findings.sort((left, right) =>
    right.day.localeCompare(left.day) || right.delta_verified - left.delta_verified
  );
};

export const findUnrealisticEnduranceSessions = async ({ limit = 100 } = {}) => {
  assertPositiveInteger(limit, 'limit');
  const { rows } = await query(
    `SELECT id AS session_id, user_id, started_at, ended_at
     FROM sessions
     WHERE source = 'timer'
       AND status IN ('running', 'ended')
       AND paused_seconds = 0
       AND break_seconds = 0
       AND COALESCE(ended_at, NOW()) - started_at >= INTERVAL '6 hours'
     ORDER BY started_at DESC
     LIMIT $1`,
    [limit]
  );

  return rows.map((row) => ({
    session_id: row.session_id,
    user_id: row.user_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    flag: 'UNREALISTIC_ENDURANCE',
  }));
};

export const runNightlyAntiCheatAudit = async (options = {}) => {
  const [
    suspiciousDays,
    consecutiveHighVolumeDays,
    discrepancies,
    enduranceSessions,
  ] = await Promise.all([
    findSuspiciousDays(options),
    findConsecutiveHighVolumeDays(options),
    auditSessionDiscrepancies(options),
    findUnrealisticEnduranceSessions(options),
  ]);
  const flaggedUserIds = new Set([
    ...suspiciousDays.map((day) => day.user_id),
    ...consecutiveHighVolumeDays.map((finding) => finding.user_id),
    ...discrepancies.map((finding) => finding.user_id),
    ...enduranceSessions.map((session) => session.user_id),
=======
/**
 * Audits discrepancy between raw session study time and daily_totals.
 * Identifies any mathematical drift or tamper between session history and cached rollups.
 *
 * @param {Object} options
 * @param {number} [options.lookbackDays=7] - Window of days to audit
 * @param {number} [options.toleranceMinutes=1] - Allowed rounding delta
 * @returns {Promise<Array>} Records where daily_totals diverges from sessions
 */
export const auditSessionDiscrepancies = async ({
  lookbackDays = 7,
  toleranceMinutes = 1,
} = {}) => {
  const sql = `
    WITH session_sums AS (
      SELECT
        s.user_id,
        TO_CHAR(s.started_at, 'YYYY-MM-DD') AS day,
        SUM(CASE WHEN s.verified THEN FLOOR(s.study_seconds / 60) ELSE 0 END) AS session_verified_mins,
        SUM(FLOOR(s.study_seconds / 60)) AS session_total_mins
      FROM sessions s
      WHERE s.status = 'ended'
        AND s.started_at >= CURRENT_DATE - ($1 * INTERVAL '1 day')
      GROUP BY s.user_id, TO_CHAR(s.started_at, 'YYYY-MM-DD')
    )
    SELECT
      ss.user_id,
      u.username,
      ss.day,
      ss.session_verified_mins,
      dt.verified_minutes AS dt_verified_mins,
      ABS(COALESCE(ss.session_verified_mins, 0) - COALESCE(dt.verified_minutes, 0)) AS delta_verified
    FROM session_sums ss
    JOIN users u ON u.id = ss.user_id
    LEFT JOIN daily_totals dt ON dt.user_id = ss.user_id AND dt.day::text = ss.day
    WHERE ABS(COALESCE(ss.session_verified_mins, 0) - COALESCE(dt.verified_minutes, 0)) > $2
    ORDER BY ss.day DESC, delta_verified DESC
  `;

  const { rows } = await query(sql, [lookbackDays, toleranceMinutes]);

  return rows.map((row) => ({
    user_id: row.user_id,
    username: row.username,
    day: row.day,
    session_verified_mins: parseInt(row.session_verified_mins, 10),
    daily_totals_verified_mins: parseInt(row.dt_verified_mins || 0, 10),
    delta_verified: parseInt(row.delta_verified, 10),
  }));
};

/**
 * Runs a complete anti-cheat review report.
 */
export const runNightlyAntiCheatAudit = async (options = {}) => {
  const [suspiciousDays, discrepancies] = await Promise.all([
    findSuspiciousDays(options),
    auditSessionDiscrepancies(options),
  ]);

  const flaggedUserIds = new Set([
    ...suspiciousDays.map((d) => d.user_id),
    ...discrepancies.map((d) => d.user_id),
>>>>>>> origin/main
  ]);

  return {
    timestamp: new Date().toISOString(),
    flagged_users_count: flaggedUserIds.size,
    suspicious_days_count: suspiciousDays.length,
<<<<<<< HEAD
    consecutive_high_volume_days_count: consecutiveHighVolumeDays.length,
    discrepancies_count: discrepancies.length,
    unrealistic_endurance_sessions_count: enduranceSessions.length,
    suspicious_days: suspiciousDays,
    consecutive_high_volume_days: consecutiveHighVolumeDays,
    discrepancies,
    unrealistic_endurance_sessions: enduranceSessions,
  };
};
=======
    discrepancies_count: discrepancies.length,
    suspicious_days: suspiciousDays,
    discrepancies,
  };
};

>>>>>>> origin/main
