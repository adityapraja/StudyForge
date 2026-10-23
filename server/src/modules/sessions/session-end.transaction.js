import { DateTime } from 'luxon';
import { config } from '../../config.js';
import {
  calculateSessionXp,
  getXpBreakdown,
  awardSessionXp,
  awardDailyGoalXp,
} from '../progression/xp.service.js';
import { updateStreakOnSessionEnd } from '../progression/streak.service.js';
import { AppError } from '../../middleware/error-handler.js';

const requireValidTimeZone = (timeZone) => {
  if (!timeZone || !DateTime.now().setZone(timeZone).isValid) {
    throw new AppError(
      500,
      'INVALID_STORED_TIME_ZONE',
      'The user has an invalid stored time zone.'
    );
  }
  return timeZone;
};

/**
 * Splits a study session across local calendar days according to the user's time zone.
 * Distributes study_seconds proportionally based on the wall clock time in each day.
 */
export const splitSessionAcrossDays = (startedAt, endedAt, studySeconds, timeZone) => {
  const zone = requireValidTimeZone(timeZone);
  const startDt = DateTime.fromJSDate(startedAt, { zone });
  const endDt = DateTime.fromJSDate(endedAt, { zone });

  // If both fall on the same local date
  if (startDt.toISODate() === endDt.toISODate()) {
    return [
      {
        day: startDt.toISODate(),
        studySeconds,
        wallSeconds: Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)),
      },
    ];
  }

  // Crossing one or more midnights
  const segments = [];
  let currentStart = startDt;

  while (currentStart < endDt) {
    const nextDayStart = currentStart.plus({ days: 1 }).startOf('day');
    const segmentEnd = nextDayStart < endDt ? nextDayStart : endDt;

    const wallSeconds = Math.max(
      0,
      Math.round(segmentEnd.diff(currentStart, 'seconds').seconds)
    );

    segments.push({
      day: currentStart.toISODate(),
      wallSeconds,
    });

    currentStart = nextDayStart;
  }

  const totalWallSeconds = segments.reduce((sum, seg) => sum + seg.wallSeconds, 0);

  let distributedStudySeconds = 0;
  return segments.map((seg, index) => {
    let dayStudySeconds;
    if (index === segments.length - 1) {
      // Last segment gets the remainder to guarantee exact sum
      dayStudySeconds = Math.max(0, studySeconds - distributedStudySeconds);
    } else {
      const ratio = totalWallSeconds > 0 ? seg.wallSeconds / totalWallSeconds : 0;
      dayStudySeconds = Math.round(studySeconds * ratio);
      distributedStudySeconds += dayStudySeconds;
    }

    return {
      day: seg.day,
      studySeconds: dayStudySeconds,
      wallSeconds: seg.wallSeconds,
    };
  });
};

/**
 * Executes the complete session-end transaction:
 * 1. Computes final study_seconds, applying caps
 * 2. Splits session across local calendar days
 * 3. Updates daily_totals with daily cap enforcement
 * 4. Awards XP and updates user level
 * 5. Updates streak with weekly freeze evaluation
 * All inside a single PostgreSQL transaction.
 */
export const executeSessionEndTransaction = async (client, user, session, options = {}) => {
  const zone = requireValidTimeZone(user.time_zone);
  const now = options.endedAt || new Date();

  // Finalize pause / break stretch if currently paused or on break
  let pausedSeconds = session.paused_seconds || 0;
  let breakSeconds = session.break_seconds || 0;

  if (session.status === 'paused') {
    const segmentStart = new Date(session.segment_started_at);
    pausedSeconds += Math.max(0, Math.floor((now.getTime() - segmentStart.getTime()) / 1000));
  } else if (session.status === 'on_break') {
    const segmentStart = new Date(session.segment_started_at);
    breakSeconds += Math.max(0, Math.floor((now.getTime() - segmentStart.getTime()) / 1000));
  }

  // Enforce maximum session length cap
  const maxSessionSeconds = config.maxSessionHours * 3600;
  let effectiveEndedAt = now;
  const startedAt = new Date(session.started_at);
  const wallDuration = Math.max(0, Math.floor((effectiveEndedAt.getTime() - startedAt.getTime()) / 1000));

  if (wallDuration > maxSessionSeconds) {
    effectiveEndedAt = new Date(startedAt.getTime() + maxSessionSeconds * 1000);
  }

  // Calculate net focused study seconds
  const totalElapsed = Math.max(0, Math.floor((effectiveEndedAt.getTime() - startedAt.getTime()) / 1000));
  const studySeconds = Math.max(0, totalElapsed - pausedSeconds - breakSeconds);

  // Update session record in DB
  const { rows: updatedSessionRows } = await client.query(
    `UPDATE sessions
     SET ended_at = $1,
         status = 'ended',
         study_seconds = $2,
         paused_seconds = $3,
         break_seconds = $4,
         note = $5
     WHERE id = $6
     RETURNING id, subject_id, started_at, ended_at, status, paused_seconds,
               break_seconds, segment_started_at, study_seconds, note, source, verified`,
    [
      effectiveEndedAt,
      studySeconds,
      pausedSeconds,
      breakSeconds,
      options.note !== undefined ? options.note : session.note,
      session.id,
    ]
  );
  const endedSession = updatedSessionRows[0];

  // Split session across calendar days in user's time zone
  const daySegments = splitSessionAcrossDays(startedAt, effectiveEndedAt, studySeconds, zone);

  const dailyCapMinutes = config.dailyCapHours * 60;
  let totalCountedSeconds = 0;
  let leaderboardCreditedSeconds = 0;
  let accumulatedStudySeconds = 0;
  const { rows: creditTimeRows } = await client.query(
    `SELECT clock_timestamp() AS credited_at`
  );
  const creditedAt = creditTimeRows[0].credited_at;

  for (const seg of daySegments) {
    const { rows: disqualifiedDayRows } = await client.query(
      `SELECT 1
       FROM session_disqualifications
       WHERE user_id = $1 AND day = $2 AND scope = 'user_day'`,
      [user.id, seg.day]
    );
    const dayDisqualified = disqualifiedDayRows.length > 0;

    // Check existing totals for that day
    const { rows: existingRows } = await client.query(
      `SELECT minutes, verified_minutes
       FROM daily_totals
       WHERE user_id = $1 AND day = $2
       FOR UPDATE`,
      [user.id, seg.day]
    );

    const existingMinutes = existingRows.length > 0 ? existingRows[0].minutes : 0;
    const availableMinutes = Math.max(0, dailyCapMinutes - existingMinutes);

    const previousWholeMinutes = Math.floor(accumulatedStudySeconds / 60);
    accumulatedStudySeconds += seg.studySeconds;
    const segmentMinutes =
      Math.floor(accumulatedStudySeconds / 60) - previousWholeMinutes;
    const countedMinutes = Math.min(segmentMinutes, availableMinutes);
    const countedVerified = endedSession.verified && !dayDisqualified ? countedMinutes : 0;
    const creditedMinutes = endedSession.source === 'timer' && countedVerified > 0
      ? countedVerified
      : 0;
    if (creditedMinutes > 0) {
      leaderboardCreditedSeconds += creditedMinutes * 60;
    }

    totalCountedSeconds += countedMinutes * 60;

    // Upsert into daily_totals
    await client.query(
      `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, day)
       DO UPDATE SET
         minutes = daily_totals.minutes + EXCLUDED.minutes,
         verified_minutes = daily_totals.verified_minutes + EXCLUDED.verified_minutes,
         updated_at = NOW()`,
      [user.id, seg.day, countedMinutes, countedVerified]
    );

    await client.query(
      `INSERT INTO subject_daily_totals
         (user_id, subject_id, day, minutes, verified_minutes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, subject_id, day)
       DO UPDATE SET
         minutes = subject_daily_totals.minutes + EXCLUDED.minutes,
         verified_minutes = subject_daily_totals.verified_minutes + EXCLUDED.verified_minutes,
         updated_at = NOW()`,
      [user.id, endedSession.subject_id, seg.day, countedMinutes, countedVerified]
    );

    await client.query(
      `INSERT INTO session_day_credits
         (session_id, user_id, day, original_verified_minutes,
          verified_minutes, original_leaderboard_credited_seconds,
          leaderboard_credited_seconds, credited_at)
       VALUES ($1, $2, $3, $4, $4, $5, $5, $6)`,
      [
        endedSession.id,
        user.id,
        seg.day,
        creditedMinutes,
        creditedMinutes * 60,
        creditedMinutes > 0 ? creditedAt : null,
      ]
    );
  }

  await client.query(
    `UPDATE sessions
     SET leaderboard_credited_seconds = $1,
         leaderboard_credited_at = CASE WHEN $1 > 0 THEN $3::timestamptz ELSE NULL END
     WHERE id = $2`,
    [leaderboardCreditedSeconds, endedSession.id, creditedAt]
  );

  // Phase 2: Award XP (only for verified sessions, capped at 4 hours)
  let sessionXp = 0;
  let bonusXp = 0;
  let dailyGoalMet = false;

  const endDay = DateTime.fromJSDate(effectiveEndedAt, { zone }).toISODate();
  const { rows: endDayDisqualificationRows } = await client.query(
    `SELECT 1 FROM session_disqualifications
     WHERE user_id = $1 AND day = $2 AND scope = 'user_day'`,
    [user.id, endDay]
  );
  if (endedSession.verified && endDayDisqualificationRows.length === 0) {
    const sessionXpResult = await awardSessionXp(
      client,
      user.id,
      endedSession.id,
      studySeconds,
      true,
      endDay
    );
    sessionXp = sessionXpResult.xp || 0;

    // Check if daily target has been reached today in verified minutes
    const today = DateTime.fromJSDate(effectiveEndedAt, { zone }).toISODate();
    const { rows: todayTotals } = await client.query(
      `SELECT verified_minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
      [user.id, today]
    );
    const todayVerifiedMins = todayTotals[0]?.verified_minutes || 0;
    const targetMins = Math.floor((user.daily_target_seconds || 14400) / 60);

    if (todayVerifiedMins >= targetMins) {
      const dailyBonusResult = await awardDailyGoalXp(client, user.id, today);
      if (dailyBonusResult.awarded) {
        bonusXp = dailyBonusResult.xp;
        dailyGoalMet = true;
      }
    }
  }

  const totalXpAwarded = sessionXp + bonusXp;

  // Update streak
  const streak = await updateStreakOnSessionEnd(
    client,
    user.id,
    zone,
    user.streak_minimum_minutes,
    effectiveEndedAt
  );

  // Get total seconds today for the summary
  const todayDate = DateTime.now().setZone(zone).toISODate();
  const { rows: todayRows } = await client.query(
    `SELECT minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
    [user.id, todayDate]
  );
  const todaySeconds = todayRows.length > 0 ? todayRows[0].minutes * 60 : 0;

  return {
    session: endedSession,
    summary: {
      study_seconds: studySeconds,
      counted_seconds: totalCountedSeconds,
      verified: endedSession.verified,
      xp_awarded: totalXpAwarded,
      session_xp: sessionXp,
      bonus_xp: bonusXp,
      daily_goal_met: dailyGoalMet,
      streak: {
        current: streak.current,
        longest: streak.longest,
      },
      today_seconds: todaySeconds,
    },
  };
};
