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
export const findSuspiciousDays = async ({
  thresholdMinutes = 840,
  lookbackDays = 30,
  limit = 100,
} = {}) => {
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

  return rows.map((row) => ({
    user_id: row.user_id,
    username: row.username,
    email: row.email,
    day: row.day,
    minutes: parseInt(row.minutes, 10),
    verified_minutes: parseInt(row.verified_minutes, 10),
    manual_unverified_minutes: parseInt(row.manual_unverified_minutes, 10),
    flag: row.flag,
  }));
};

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
  ]);

  return {
    timestamp: new Date().toISOString(),
    flagged_users_count: flaggedUserIds.size,
    suspicious_days_count: suspiciousDays.length,
    discrepancies_count: discrepancies.length,
    suspicious_days: suspiciousDays,
    discrepancies,
  };
};

