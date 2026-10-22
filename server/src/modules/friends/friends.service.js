import { DateTime } from 'luxon';
import { query, withTransaction } from '../../db.js';
import { AppError } from '../../middleware/error-handler.js';

export const canView = ({
  viewerId,
  targetId,
  field,
  areFriends = false,
  blocked = false,
  privacy = {},
  isRequestParticipant = false,
  isBlocker = false,
  leaderboardHidden = false,
  audience = 'all',
}) => {
  if (blocked) return false;

  if (field === 'leaderboard') {
    if (leaderboardHidden) return false;
    return viewerId === targetId || audience === 'all' || areFriends;
  }

  if (field === 'friend_request') return isRequestParticipant;
  if (field === 'blocked_user') return isBlocker;
  if (viewerId === targetId) return true;
  if (field === 'weekly_time' || field === 'subjects') {
    return privacy[field] === 'everyone'
      || (privacy[field] === 'friends' && areFriends);
  }

  return areFriends;
};

const isBlocked = async (client, firstId, secondId) => {
  const { rows } = await client.query(
    `SELECT 1
     FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [firstId, secondId]
  );
  return rows.length > 0;
};

export const createFriendRequest = async (requesterId, username) => withTransaction(async (client) => {
  const { rows: targets } = await client.query(
    'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );
  const target = targets[0];
  if (!target || target.id === requesterId) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  const [firstId, secondId] = [requesterId, target.id].sort();
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    [firstId, secondId]
  );

  if (await isBlocked(client, requesterId, target.id)) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  const { rows: relationships } = await client.query(
    `SELECT id, requester_id, receiver_id, status
     FROM friendships
     WHERE (requester_id = $1 AND receiver_id = $2)
        OR (requester_id = $2 AND receiver_id = $1)
     FOR UPDATE`,
    [requesterId, target.id]
  );

  if (relationships.some((relationship) => relationship.status === 'accepted')) {
    throw new AppError(409, 'ALREADY_FRIENDS', 'You are already friends with this user');
  }
  if (relationships.some((relationship) => relationship.status === 'pending')) {
    throw new AppError(409, 'FRIEND_REQUEST_PENDING', 'A friend request is already pending');
  }

  const ownRequest = relationships.find((relationship) => relationship.requester_id === requesterId);
  const result = ownRequest
    ? await client.query(
      `UPDATE friendships SET status = 'pending', updated_at = NOW()
       WHERE id = $1
       RETURNING id, requester_id, receiver_id, status, created_at`,
      [ownRequest.id]
    )
    : await client.query(
      `INSERT INTO friendships (requester_id, receiver_id)
       VALUES ($1, $2)
       RETURNING id, requester_id, receiver_id, status, created_at`,
      [requesterId, target.id]
    );
  return result.rows[0];
});

export const getFriendRequests = async (userId) => {
  const { rows } = await query(
    `SELECT friendship.id, friendship.requester_id, friendship.receiver_id,
            requester.username AS requester_username,
            receiver.username AS receiver_username,
            EXISTS (
              SELECT 1 FROM blocks
              WHERE (blocker_id = friendship.requester_id AND blocked_id = friendship.receiver_id)
                 OR (blocker_id = friendship.receiver_id AND blocked_id = friendship.requester_id)
            ) AS blocked
     FROM friendships friendship
     JOIN users requester ON requester.id = friendship.requester_id
     JOIN users receiver ON receiver.id = friendship.receiver_id
     WHERE friendship.status = 'pending'
       AND (friendship.requester_id = $1 OR friendship.receiver_id = $1)
     ORDER BY friendship.created_at, friendship.id`,
    [userId]
  );

  const incoming = [];
  const outgoing = [];
  for (const request of rows) {
    if (request.receiver_id === userId) {
      if (!canView({
        viewerId: userId,
        targetId: request.requester_id,
        field: 'friend_request',
        isRequestParticipant: true,
        blocked: request.blocked,
      })) continue;
      incoming.push({
        id: request.id,
        from: { id: request.requester_id, username: request.requester_username },
      });
    } else {
      if (!canView({
        viewerId: userId,
        targetId: request.receiver_id,
        field: 'friend_request',
        isRequestParticipant: true,
        blocked: request.blocked,
      })) continue;
      outgoing.push({
        id: request.id,
        to: { id: request.receiver_id, username: request.receiver_username },
      });
    }
  }
  return { incoming, outgoing };
};

export const updateFriendRequest = async (userId, requestId, action) => withTransaction(async (client) => {
  const { rows } = await client.query(
    `SELECT id, requester_id, receiver_id, status
     FROM friendships WHERE id = $1 FOR UPDATE`,
    [requestId]
  );
  const friendship = rows[0];
  if (!friendship || friendship.receiver_id !== userId || friendship.status !== 'pending') {
    throw new AppError(404, 'NOT_FOUND', 'Friend request not found');
  }
  if (await isBlocked(client, friendship.requester_id, friendship.receiver_id)) {
    throw new AppError(404, 'NOT_FOUND', 'Friend request not found');
  }
  const status = action === 'accept' ? 'accepted' : 'declined';
  const result = await client.query(
    `UPDATE friendships SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, requester_id, receiver_id, status`,
    [status, requestId]
  );
  return result.rows[0];
});

export const getFriends = async (userId) => {
  const { rows } = await query(
    `SELECT friend.id AS user_id, friend.username, friend.level,
            COALESCE(streak.current, 0)::integer AS streak_current,
            friend.privacy,
            EXISTS (
              SELECT 1 FROM blocks
              WHERE (blocker_id = $1 AND blocked_id = friend.id)
                 OR (blocker_id = friend.id AND blocked_id = $1)
            ) AS blocked,
            weekly.seconds AS week_seconds,
            subject_week.items AS subjects
     FROM friendships friendship
     JOIN users friend
       ON friend.id = CASE
         WHEN friendship.requester_id = $1 THEN friendship.receiver_id
         ELSE friendship.requester_id
       END
     LEFT JOIN streaks streak ON streak.user_id = friend.id
     LEFT JOIN LATERAL (
       SELECT (COALESCE(SUM(totals.minutes), 0) * 60)::integer AS seconds
       FROM daily_totals totals
       WHERE totals.user_id = friend.id
         AND totals.day >= date_trunc('week', NOW() AT TIME ZONE friend.time_zone)::date
         AND totals.day < (date_trunc('week', NOW() AT TIME ZONE friend.time_zone)::date + 7)
     ) weekly ON true
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object(
           'subject_id', summary.id,
           'name', summary.name,
           'color', summary.color,
           'seconds', summary.seconds
         ) ORDER BY summary.name
       ) AS items
       FROM (
         SELECT subject.id, subject.name, subject.color,
                (SUM(subject_totals.minutes) * 60)::integer AS seconds
         FROM subject_daily_totals subject_totals
         JOIN subjects subject ON subject.id = subject_totals.subject_id
         WHERE subject_totals.user_id = friend.id
           AND subject_totals.day >= date_trunc('week', NOW() AT TIME ZONE friend.time_zone)::date
           AND subject_totals.day < (date_trunc('week', NOW() AT TIME ZONE friend.time_zone)::date + 7)
         GROUP BY subject.id, subject.name, subject.color
       ) summary
     ) subject_week ON true
     WHERE friendship.status = 'accepted'
       AND (friendship.requester_id = $1 OR friendship.receiver_id = $1)
     ORDER BY LOWER(friend.username), friend.id`,
    [userId]
  );

  return {
    items: rows
      .filter((friend) => canView({
        viewerId: userId,
        targetId: friend.user_id,
        field: 'profile',
        areFriends: true,
        blocked: friend.blocked,
      }))
      .map((friend) => ({
        user_id: friend.user_id,
        username: friend.username,
        level: friend.level,
        streak_current: friend.streak_current,
        week_seconds: canView({
          viewerId: userId,
          targetId: friend.user_id,
          field: 'weekly_time',
          areFriends: true,
          blocked: friend.blocked,
          privacy: friend.privacy,
        }) ? friend.week_seconds : null,
        subjects: canView({
          viewerId: userId,
          targetId: friend.user_id,
          field: 'subjects',
          areFriends: true,
          blocked: friend.blocked,
          privacy: friend.privacy,
        }) ? friend.subjects || [] : null,
      })),
  };
};

export const removeFriend = async (userId, friendId) => {
  const { rowCount } = await query(
    `DELETE FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND receiver_id = $2)
         OR (requester_id = $2 AND receiver_id = $1))`,
    [userId, friendId]
  );
  if (!rowCount) throw new AppError(404, 'NOT_FOUND', 'Friend not found');
};

export const blockUser = async (blockerId, blockedId) => withTransaction(async (client) => {
  if (blockerId === blockedId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'You cannot block yourself');
  }
  const [firstId, secondId] = [blockerId, blockedId].sort();
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    [firstId, secondId]
  );
  const { rows } = await client.query('SELECT id FROM users WHERE id = $1', [blockedId]);
  if (!rows.length) throw new AppError(404, 'NOT_FOUND', 'User not found');

  await client.query(
    `INSERT INTO blocks (blocker_id, blocked_id)
     VALUES ($1, $2)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
    [blockerId, blockedId]
  );
  await client.query(
    `DELETE FROM friendships
     WHERE (requester_id = $1 AND receiver_id = $2)
        OR (requester_id = $2 AND receiver_id = $1)`,
    [blockerId, blockedId]
  );
});

export const getBlockedUsers = async (blockerId) => {
  const { rows } = await query(
    `SELECT blocked.id AS user_id, blocked.username
     FROM blocks
     JOIN users blocked ON blocked.id = blocks.blocked_id
     WHERE blocks.blocker_id = $1
     ORDER BY LOWER(blocked.username), blocked.id`,
    [blockerId]
  );
  return {
    items: rows.filter((blocked) => canView({
      viewerId: blockerId,
      targetId: blocked.user_id,
      field: 'blocked_user',
      isBlocker: true,
    })),
  };
};

export const unblockUser = async (blockerId, blockedId) => {
  const { rowCount } = await query(
    'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [blockerId, blockedId]
  );
  if (!rowCount) throw new AppError(404, 'NOT_FOUND', 'Block not found');
};

export const periodBounds = (period, timeZone) => {
  const now = DateTime.now().setZone(timeZone);
  const start = period === 'day'
    ? now.startOf('day')
    : period === 'week'
      ? now.startOf('week')
      : now.startOf('month');
  const next = period === 'day'
    ? start.plus({ days: 1 })
    : period === 'week'
      ? start.plus({ weeks: 1 })
      : start.plus({ months: 1 });
  return { start, next };
};

export const getLeaderboard = async (viewer, { period, category, scope }) => {
  const bounds = periodBounds(period, viewer.time_zone);
  const { rows } = await query(
    `WITH scores AS (
       SELECT study_session.user_id,
              SUM(study_session.study_seconds)::integer AS seconds,
              MAX(study_session.ended_at) AS reached_at,
              EXISTS (
                SELECT 1 FROM friendships friendship
                WHERE friendship.status = 'accepted'
                  AND ((friendship.requester_id = $2 AND friendship.receiver_id = study_session.user_id)
                    OR (friendship.receiver_id = $2 AND friendship.requester_id = study_session.user_id))
              ) AS are_friends,
              EXISTS (
                SELECT 1 FROM blocks
                WHERE (blocker_id = $2 AND blocked_id = study_session.user_id)
                   OR (blocker_id = study_session.user_id AND blocked_id = $2)
              ) AS blocked,
              user_row.leaderboard_hidden
       FROM sessions study_session
       JOIN users user_row ON user_row.id = study_session.user_id AND user_row.category = $1
       WHERE study_session.ended_at IS NOT NULL
         AND study_session.source = 'timer'
         AND study_session.verified = true
         AND study_session.study_seconds > 0
         AND study_session.started_at >= $3
         AND study_session.started_at < $4
       GROUP BY study_session.user_id, user_row.leaderboard_hidden
     )
     SELECT user_row.id AS user_id, user_row.username, user_row.level,
            scores.seconds, scores.reached_at, scores.are_friends,
            scores.blocked, scores.leaderboard_hidden
     FROM scores
     JOIN users user_row ON user_row.id = scores.user_id
     ORDER BY scores.seconds DESC, scores.reached_at ASC, user_row.id ASC`,
    [
      category,
      viewer.id,
      bounds.start.toUTC().toISO(),
      bounds.next.toUTC().toISO(),
    ]
  );

  const visible = rows.filter((entry) => canView({
    viewerId: viewer.id,
    targetId: entry.user_id,
    field: 'leaderboard',
    areFriends: entry.are_friends,
    blocked: entry.blocked,
    leaderboardHidden: entry.leaderboard_hidden,
    audience: scope,
  }));
  const ranked = visible.map((entry, index) => ({
    rank: index + 1,
    user_id: entry.user_id,
    username: entry.username,
    level: entry.level,
    seconds: entry.seconds,
  }));
  const mine = ranked.find((entry) => entry.user_id === viewer.id);

  return {
    period,
    category,
    scope,
    period_start: bounds.start.toISODate(),
    period_end: bounds.next.minus({ days: 1 }).toISODate(),
    entries: ranked.slice(0, 50),
    me: mine ? { rank: mine.rank, seconds: mine.seconds } : null,
  };
};
