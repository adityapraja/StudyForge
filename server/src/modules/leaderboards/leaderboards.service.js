import { DateTime } from 'luxon';
import { withTransaction } from '../../db.js';
import { canViewMany } from '../privacy/can-view.service.js';

const getPeriodBounds = (period, timeZone) => {
  const today = DateTime.now().setZone(timeZone).startOf('day');
  const start = period === 'day'
    ? today
    : period === 'week'
      ? today.startOf('week')
      : today.startOf('month');
  const end = period === 'day'
    ? today
    : period === 'week'
      ? start.plus({ days: 6 })
      : today.endOf('month').startOf('day');
  return { start, end };
};

export const getLeaderboard = async (viewer, { period, category, scope }) => withTransaction(async (client) => {
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  const selectedCategory = category || viewer.category;
  const { start, end } = getPeriodBounds(period, viewer.time_zone || 'UTC');
  const startAt = start.toUTC().toISO();
  const endAt = end.plus({ days: 1 }).startOf('day').toUTC().toISO();
  const startDate = start.toISODate();
  const endDate = end.toISODate();

  let candidateRows;
  if (scope === 'friends') {
    const result = await client.query(
      `SELECT $1::uuid AS id
       UNION
       SELECT CASE
         WHEN requester_id = $1 THEN receiver_id
         ELSE requester_id
       END AS id
       FROM friendships
       WHERE status = 'accepted'
         AND (requester_id = $1 OR receiver_id = $1)`,
      [viewer.id]
    );
    candidateRows = result.rows;
  } else {
    const result = await client.query(
      `SELECT id FROM users
       WHERE category = $1 AND leaderboard_hidden = false`,
      [selectedCategory]
    );
    candidateRows = result.rows;
  }

  const visibleIds = await canViewMany(
    viewer.id,
    candidateRows.map((row) => row.id),
    'weekly_time',
    client
  );
  if (visibleIds.size === 0) {
    return {
      period,
      category: selectedCategory,
      scope,
      period_start: startDate,
      period_end: endDate,
      entries: [],
      me: null,
    };
  }

  const { rows } = await client.query(
    `WITH scores AS (
       SELECT sessions.user_id,
              SUM(credits.leaderboard_credited_seconds)::integer AS seconds,
              MAX(credits.credited_at) AS reached_score_at
       FROM session_day_credits credits
       JOIN sessions ON sessions.id = credits.session_id
       WHERE sessions.user_id = ANY($1::uuid[])
         AND sessions.source = 'timer'
         AND sessions.verified = true
         AND sessions.status = 'ended'
         AND sessions.disqualified_at IS NULL
         AND credits.leaderboard_credited_seconds > 0
         AND credits.credited_at >= $2
         AND credits.credited_at < $3
       GROUP BY sessions.user_id
     ),
     ranked AS (
       SELECT users.id AS user_id, users.username, users.level, scores.seconds,
              scores.reached_score_at,
              ROW_NUMBER() OVER (
                ORDER BY scores.seconds DESC,
                         scores.reached_score_at ASC,
                         users.id
              )::integer AS rank
       FROM scores
       JOIN users ON users.id = scores.user_id
       WHERE users.category = $4 AND users.leaderboard_hidden = false
     )
     SELECT user_id, username, level, seconds, rank
     FROM ranked
     ORDER BY rank`,
    [
      [...visibleIds],
      startAt,
      endAt,
      selectedCategory,
    ]
  );

  const viewerEntry = rows.find((row) => row.user_id === viewer.id);
  return {
    period,
    category: selectedCategory,
    scope,
    period_start: startDate,
    period_end: endDate,
    entries: rows.slice(0, 50).map((row) => ({
      rank: row.rank,
      user_id: row.user_id,
      username: row.username,
      level: row.level,
      seconds: row.seconds,
    })),
    me: viewerEntry ? { rank: viewerEntry.rank, seconds: viewerEntry.seconds } : null,
  };
});
