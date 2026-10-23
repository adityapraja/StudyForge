import { withTransaction } from '../../db.js';
import { AppError } from '../../middleware/error-handler.js';
import { getXpBreakdown } from './xp.service.js';

const requireConfirmation = ({ confirmedBy, confirmationReference }) => {
  if (!confirmedBy?.trim() || !confirmationReference?.trim()) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'A reviewer identity and confirmation reference are required.'
    );
  }
};

const lockUser = async (client, userId) => {
  const { rowCount } = await client.query(
    `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  if (rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }
};

const reverseXpEvents = async (client, userId, disqualificationId, whereSql, values) => {
  const { rows: events } = await client.query(
    `SELECT id, amount
     FROM xp_events
     WHERE user_id = $1 AND reversed_at IS NULL AND ${whereSql}
     ORDER BY id
     FOR UPDATE`,
    [userId, ...values]
  );
  const xpToRevoke = events.reduce((total, event) => total + event.amount, 0);
  if (events.length === 0) return 0;

  const eventIds = events.map((event) => event.id);
  await client.query(
    `UPDATE xp_events
     SET reversed_at = NOW(), disqualification_id = $2
     WHERE id = ANY($1::uuid[])`,
    [eventIds, disqualificationId]
  );

  if (xpToRevoke > 0) {
    const { rows: users } = await client.query(
      `SELECT xp FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    const currentXp = users[0]?.xp ?? 0;
    if (currentXp < xpToRevoke) {
      throw new AppError(409, 'ACCOUNTING_MISMATCH', 'Recorded XP exceeds the user XP balance.');
    }
    const newXp = currentXp - xpToRevoke;
    const { level } = getXpBreakdown(newXp);
    await client.query(
      `UPDATE users SET xp = $1, level = $2, updated_at = NOW() WHERE id = $3`,
      [newXp, level, userId]
    );
  }
  return xpToRevoke;
};

const subtractDayTotals = async (client, userId, rows) => {
  for (const credit of rows) {
    const minutes = credit.verified_minutes;
    if (minutes <= 0) continue;
    const daily = await client.query(
      `UPDATE daily_totals
       SET verified_minutes = verified_minutes - $3, updated_at = NOW()
       WHERE user_id = $1 AND day = $2 AND verified_minutes >= $3`,
      [userId, credit.day, minutes]
    );
    const subject = await client.query(
      `UPDATE subject_daily_totals
       SET verified_minutes = verified_minutes - $4, updated_at = NOW()
       WHERE user_id = $1 AND subject_id = $2 AND day = $3
         AND verified_minutes >= $4`,
      [userId, credit.subject_id, credit.day, minutes]
    );
    if (daily.rowCount !== 1 || subject.rowCount !== 1) {
      throw new AppError(409, 'ACCOUNTING_MISMATCH', 'Verified study totals do not match session credits.');
    }
  }
};

const recomputeSessionCredits = async (client, sessionIds) => {
  if (sessionIds.length === 0) return;
  await client.query(
    `UPDATE sessions s
     SET leaderboard_credited_seconds = credits.seconds,
         leaderboard_credited_at = CASE WHEN credits.seconds > 0 THEN credits.latest_at ELSE NULL END
     FROM (
       SELECT session_id,
              SUM(leaderboard_credited_seconds)::integer AS seconds,
              MAX(credited_at) AS latest_at
       FROM session_day_credits
       WHERE session_id = ANY($1::uuid[])
       GROUP BY session_id
     ) credits
     WHERE s.id = credits.session_id`,
    [sessionIds]
  );
  await client.query(
    `UPDATE sessions
     SET leaderboard_credited_seconds = 0, leaderboard_credited_at = NULL
     WHERE id = ANY($1::uuid[])
       AND NOT EXISTS (
         SELECT 1 FROM session_day_credits c
         WHERE c.session_id = sessions.id AND c.leaderboard_credited_seconds > 0
       )`,
    [sessionIds]
  );
};

export const disqualifySession = async ({
  sessionId,
  confirmedBy,
  confirmationReference,
}) => {
  requireConfirmation({ confirmedBy, confirmationReference });
  return withTransaction(async (client) => {
    const { rows: owners } = await client.query(
      `SELECT user_id FROM sessions WHERE id = $1`,
      [sessionId]
    );
    if (owners.length === 0) throw new AppError(404, 'NOT_FOUND', 'Session not found');
    const userId = owners[0].user_id;
    await lockUser(client, userId);

    const { rows: sessions } = await client.query(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [sessionId, userId]
    );
    const session = sessions[0];
    if (!session) throw new AppError(404, 'NOT_FOUND', 'Session not found');
    const { rows: prior } = await client.query(
      `SELECT id FROM session_disqualifications
       WHERE scope = 'session' AND session_id = $1`,
      [sessionId]
    );
    if (prior.length > 0 || session.disqualified_at) {
      return { disqualified: false, already_disqualified: true, xp_revoked: 0 };
    }

    const { rows: credits } = await client.query(
      `SELECT c.*, s.subject_id
       FROM session_day_credits c
       JOIN sessions s ON s.id = c.session_id
       WHERE c.session_id = $1
       ORDER BY c.day
       FOR UPDATE OF c`,
      [sessionId]
    );
    if (credits.length === 0) {
      throw new AppError(
        409,
        'UNSUPPORTED_HISTORICAL_CREDITS',
        'This session predates per-day credit attribution and cannot be safely disqualified.'
      );
    }
    const attributedSeconds = credits.reduce(
      (sum, credit) => sum + credit.leaderboard_credited_seconds,
      0
    );
    if (attributedSeconds !== session.leaderboard_credited_seconds) {
      throw new AppError(
        409,
        'ACCOUNTING_MISMATCH',
        'Session leaderboard totals do not match per-day credit attribution.'
      );
    }

    const { rows: records } = await client.query(
      `INSERT INTO session_disqualifications
         (scope, user_id, session_id, reason, confirmed_by, confirmation_reference)
       VALUES ('session', $1, $2, 'confirmed_invalid_session', $3, $4)
       RETURNING id`,
      [userId, sessionId, confirmedBy.trim(), confirmationReference.trim()]
    );
    const disqualificationId = records[0].id;
    await subtractDayTotals(client, userId, credits);
    await client.query(
      `UPDATE session_day_credits
       SET verified_minutes = 0, leaderboard_credited_seconds = 0,
           revoked_at = NOW(), disqualification_id = $2
       WHERE session_id = $1 AND disqualification_id IS NULL`,
      [sessionId, disqualificationId]
    );
    await client.query(
      `UPDATE sessions
       SET verified = false, disqualified_at = NOW(),
           leaderboard_credited_seconds = 0, leaderboard_credited_at = NULL
       WHERE id = $1`,
      [sessionId]
    );
    const xpRevoked = await reverseXpEvents(
      client,
      userId,
      disqualificationId,
      `session_id = $2 AND kind = 'session'`,
      [sessionId]
    );
    return {
      disqualified: true,
      already_disqualified: false,
      xp_revoked: xpRevoked,
    };
  });
};

export const disqualifyUserDay = async ({
  userId,
  day,
  confirmedBy,
  confirmationReference,
}) => {
  requireConfirmation({ confirmedBy, confirmationReference });
  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const { rows: prior } = await client.query(
      `SELECT id FROM session_disqualifications
       WHERE scope = 'user_day' AND user_id = $1 AND day = $2`,
      [userId, day]
    );
    if (prior.length > 0) {
      return { disqualified: false, already_disqualified: true, xp_revoked: 0 };
    }

    await client.query(
      `SELECT id FROM sessions WHERE user_id = $1 ORDER BY id FOR UPDATE`,
      [userId]
    );
    const { rows: credits } = await client.query(
      `SELECT c.*, s.subject_id
       FROM session_day_credits c
       JOIN sessions s ON s.id = c.session_id
       WHERE c.user_id = $1 AND c.day = $2
       ORDER BY c.session_id
       FOR UPDATE OF c`,
      [userId, day]
    );
    if (credits.length === 0) {
      throw new AppError(
        409,
        'UNSUPPORTED_HISTORICAL_CREDITS',
        'This user-day predates per-day credit attribution and cannot be safely disqualified.'
      );
    }

    const { rows: totals } = await client.query(
      `SELECT verified_minutes FROM daily_totals
       WHERE user_id = $1 AND day = $2 FOR UPDATE`,
      [userId, day]
    );
    const attributedMinutes = credits.reduce((sum, credit) => sum + credit.verified_minutes, 0);
    if ((totals[0]?.verified_minutes ?? 0) !== attributedMinutes) {
      throw new AppError(
        409,
        'ACCOUNTING_MISMATCH',
        'Daily verified totals do not match the available per-session attribution.'
      );
    }

    const { rows: records } = await client.query(
      `INSERT INTO session_disqualifications
         (scope, user_id, day, reason, confirmed_by, confirmation_reference)
       VALUES ('user_day', $1, $2, 'confirmed_day_tampering', $3, $4)
       RETURNING id`,
      [userId, day, confirmedBy.trim(), confirmationReference.trim()]
    );
    const disqualificationId = records[0].id;
    const minutesBySubject = new Map();
    const sessionIds = [...new Set(credits.map((credit) => credit.session_id))];
    for (const credit of credits) {
      minutesBySubject.set(
        credit.subject_id,
        (minutesBySubject.get(credit.subject_id) || 0) + credit.verified_minutes
      );
    }
    await subtractDayTotals(
      client,
      userId,
      [...minutesBySubject].map(([subject_id, verified_minutes]) => ({
        subject_id,
        day,
        verified_minutes,
      }))
    );
    await client.query(
      `UPDATE session_day_credits
       SET verified_minutes = 0, leaderboard_credited_seconds = 0,
           revoked_at = NOW(), disqualification_id = $3
       WHERE user_id = $1 AND day = $2 AND disqualification_id IS NULL`,
      [userId, day, disqualificationId]
    );
    await recomputeSessionCredits(client, sessionIds);
    const xpRevoked = await reverseXpEvents(
      client,
      userId,
      disqualificationId,
      `kind = 'session' AND day = $2 AND session_id = ANY($3::uuid[])`,
      [day, sessionIds]
    );
    return {
      disqualified: true,
      already_disqualified: false,
      xp_revoked: xpRevoked,
    };
  });
};
