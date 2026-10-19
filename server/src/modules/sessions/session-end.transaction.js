import { DateTime } from 'luxon';
import { config } from '../../config.js';
import { calculateSessionXp, getXpBreakdown } from '../progression/xp.service.js';
import { updateStreakOnSessionEnd } from '../progression/streak.service.js';

/**
 * Splits a study session across local calendar days according to the user's time zone.
 * Distributes study_seconds proportionally based on the wall clock time in each day.
 */
export const splitSessionAcrossDays = (startedAt, endedAt, studySeconds, timeZone) => {
  const zone = timeZone || 'UTC';
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
  const zone = user.time_zone || 'UTC';
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

  for (const seg of daySegments) {
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

    const segmentMinutes = Math.floor(seg.studySeconds / 60);
    const countedMinutes = Math.min(segmentMinutes, availableMinutes);
    const countedVerified = endedSession.verified ? countedMinutes : 0;

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
  }

  // Award XP (only for verified sessions, capped at 4 hours)
  let xpAwarded = 0;
  if (endedSession.verified) {
    xpAwarded = calculateSessionXp(studySeconds, true);

    if (xpAwarded > 0) {
      const endDay = DateTime.fromJSDate(effectiveEndedAt, { zone }).toISODate();

      // Prevent double XP awards for same session
      const { rows: xpEventRows } = await client.query(
        `INSERT INTO xp_events (user_id, session_id, kind, amount, day)
         VALUES ($1, $2, 'session', $3, $4)
         ON CONFLICT (session_id, kind) DO NOTHING
         RETURNING id`,
        [user.id, endedSession.id, xpAwarded, endDay]
      );

      // Only add to user's total if this xp_event was newly inserted
      if (xpEventRows.length > 0) {
        const { rows: userRows } = await client.query(
          `SELECT xp FROM users WHERE id = $1 FOR UPDATE`,
          [user.id]
        );
        const newTotalXp = (userRows[0]?.xp || 0) + xpAwarded;
        const { level: newLevel } = getXpBreakdown(newTotalXp);

        await client.query(
          `UPDATE users SET xp = $1, level = $2, updated_at = NOW() WHERE id = $3`,
          [newTotalXp, newLevel, user.id]
        );
      }
    }
  }

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
      xp_awarded: xpAwarded,
      streak: {
        current: streak.current,
        longest: streak.longest,
      },
      today_seconds: todaySeconds,
    },
  };
};
