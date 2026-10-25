import { DateTime } from 'luxon';
import { query, withTransaction } from '../../db.js';
import { AppError } from '../../middleware/error-handler.js';
import { canView } from '../privacy/can-view.service.js';

const lockUserPair = async (client, firstId, secondId) => {
  const { rows } = await client.query(
    `SELECT id FROM users
     WHERE id = ANY($1::uuid[])
     ORDER BY id
     FOR UPDATE`,
    [[firstId, secondId]]
  );
  if (rows.length !== 2) throw new AppError(404, 'NOT_FOUND', 'User not found');
};

const isBlocked = async (client, firstId, secondId) => {
  const { rows } = await client.query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [firstId, secondId]
  );
  return rows.length > 0;
};

const requestShape = (row) => ({
  id: row.id,
  from: { id: row.requester_id, username: row.requester_username },
  to: { id: row.receiver_id, username: row.receiver_username },
});

export const createFriendRequest = async (userId, username) => withTransaction(async (client) => {
  const { rows: targets } = await client.query(
    `SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)`,
    [username]
  );
  const target = targets[0];
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (target.id === userId) {
    throw new AppError(400, 'INVALID_REQUEST', 'You cannot send a friend request to yourself');
  }

  await lockUserPair(client, userId, target.id);
  if (await isBlocked(client, userId, target.id)) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  const { rows: accepted } = await client.query(
    `SELECT id FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND receiver_id = $2)
         OR (requester_id = $2 AND receiver_id = $1))
     LIMIT 1`,
    [userId, target.id]
  );
  if (accepted.length > 0) {
    throw new AppError(409, 'ALREADY_FRIENDS', 'You are already friends');
  }

  const { rows: sameDirection } = await client.query(
    `SELECT id, status FROM friendships
     WHERE requester_id = $1 AND receiver_id = $2
     FOR UPDATE`,
    [userId, target.id]
  );
  if (sameDirection[0]?.status === 'pending') {
    throw new AppError(409, 'FRIEND_REQUEST_EXISTS', 'A friend request is already pending');
  }
  const { rows: reciprocal } = await client.query(
    `SELECT id FROM friendships
     WHERE requester_id = $2 AND receiver_id = $1 AND status = 'pending'
     FOR UPDATE`,
    [userId, target.id]
  );
  if (reciprocal.length > 0) {
    await client.query(
      `DELETE FROM friendships
       WHERE requester_id = $1 AND receiver_id = $2 AND status = 'declined'`,
      [userId, target.id]
    );
    await client.query(
      `UPDATE friendships SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
      [reciprocal[0].id]
    );
    const { rows } = await client.query(
      `SELECT friendships.id, friendships.requester_id, requester.username AS requester_username,
              friendships.receiver_id, receiver.username AS receiver_username
       FROM friendships
       JOIN users requester ON requester.id = friendships.requester_id
       JOIN users receiver ON receiver.id = friendships.receiver_id
       WHERE friendships.id = $1`,
      [reciprocal[0].id]
    );
    return requestShape(rows[0]);
  }

  if (sameDirection[0]?.status === 'declined') {
    const { rows } = await client.query(
      `UPDATE friendships
       SET status = 'pending', updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [sameDirection[0].id]
    );
    const { rows: requesterRows } = await client.query(
      'SELECT username FROM users WHERE id = $1',
      [userId]
    );
    return {
      id: rows[0].id,
      from: { id: userId, username: requesterRows[0].username },
      to: { id: target.id, username: target.username },
    };
  }

  const { rows } = await client.query(
    `INSERT INTO friendships (requester_id, receiver_id)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, target.id]
  );
  const { rows: requesterRows } = await client.query(
    'SELECT username FROM users WHERE id = $1',
    [userId]
  );
  return {
    id: rows[0].id,
    from: { id: userId, username: requesterRows[0].username },
    to: { id: target.id, username: target.username },
  };
});

export const getFriendRequests = async (userId) => {
  const { rows } = await query(
    `SELECT friendships.id, friendships.requester_id, requester.username AS requester_username,
            friendships.receiver_id, receiver.username AS receiver_username
     FROM friendships
     JOIN users requester ON requester.id = friendships.requester_id
     JOIN users receiver ON receiver.id = friendships.receiver_id
     WHERE friendships.status = 'pending'
       AND (friendships.requester_id = $1 OR friendships.receiver_id = $1)
       AND NOT EXISTS (
         SELECT 1 FROM blocks
         WHERE (blocker_id = friendships.requester_id AND blocked_id = friendships.receiver_id)
            OR (blocker_id = friendships.receiver_id AND blocked_id = friendships.requester_id)
       )
     ORDER BY friendships.created_at, friendships.id`,
    [userId]
  );
  return {
    incoming: rows
      .filter((row) => row.receiver_id === userId)
      .map((row) => ({ id: row.id, from: { id: row.requester_id, username: row.requester_username } })),
    outgoing: rows
      .filter((row) => row.requester_id === userId)
      .map((row) => ({ id: row.id, to: { id: row.receiver_id, username: row.receiver_username } })),
  };
};

export const respondToFriendRequest = async (userId, requestId, action) => withTransaction(async (client) => {
  const { rows: initialRows } = await client.query(
    `SELECT requester_id, receiver_id
     FROM friendships
     WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
     `,
    [requestId, userId]
  );
  const initial = initialRows[0];
  if (!initial) throw new AppError(404, 'NOT_FOUND', 'Friend request not found');

  await lockUserPair(client, initial.requester_id, initial.receiver_id);
  const { rows: lockedRows } = await client.query(
    `SELECT id, requester_id, receiver_id
     FROM friendships
     WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
     FOR UPDATE`,
    [requestId, userId]
  );
  const friendship = lockedRows[0];
  if (!friendship) throw new AppError(404, 'NOT_FOUND', 'Friend request not found');

  if (await isBlocked(client, friendship.requester_id, friendship.receiver_id)) {
    throw new AppError(404, 'NOT_FOUND', 'Friend request not found');
  }

  if (action === 'accept') {
    await client.query(
      `DELETE FROM friendships
       WHERE status = 'pending'
         AND requester_id = $1 AND receiver_id = $2`,
      [friendship.receiver_id, friendship.requester_id]
    );
    await client.query(
      `UPDATE friendships SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
      [requestId]
    );
  } else {
    await client.query(
      `UPDATE friendships SET status = 'declined', updated_at = NOW() WHERE id = $1`,
      [requestId]
    );
  }
  return { ok: true };
});

export const getFriends = async (userId) => withTransaction(async (client) => {
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  const { rows: friendRows } = await client.query(
    `SELECT friend.id AS user_id, friend.username, friend.time_zone, friend.level,
            COALESCE(streaks.current, 0) AS streak_current
     FROM friendships
     JOIN users friend
       ON friend.id = CASE
         WHEN friendships.requester_id = $1 THEN friendships.receiver_id
         ELSE friendships.requester_id
       END
     LEFT JOIN streaks ON streaks.user_id = friend.id
     WHERE friendships.status = 'accepted'
       AND (friendships.requester_id = $1 OR friendships.receiver_id = $1)
       AND NOT EXISTS (
         SELECT 1 FROM blocks
         WHERE (blocker_id = $1 AND blocked_id = friend.id)
            OR (blocker_id = friend.id AND blocked_id = $1)
       )
     ORDER BY friend.username, friend.id`,
    [userId]
  );

  const items = [];
  for (const friend of friendRows) {
    const visible = await canView(userId, friend.user_id, 'weekly_time', client);
    let weekSeconds = null;
    if (visible) {
      const zone = friend.time_zone || 'UTC';
      const now = DateTime.now().setZone(zone);
      const { rows } = await client.query(
        `SELECT COALESCE(SUM(minutes), 0)::integer * 60 AS seconds
         FROM daily_totals
         WHERE user_id = $1 AND day >= $2 AND day <= $3`,
        [friend.user_id, now.startOf('week').toISODate(), now.endOf('week').toISODate()]
      );
      weekSeconds = rows[0].seconds;
    }
    items.push({
      user_id: friend.user_id,
      username: friend.username,
      level: friend.level,
      streak_current: friend.streak_current,
      week_seconds: weekSeconds,
    });
  }
  return { items };
});

export const removeFriend = async (userId, friendId) => withTransaction(async (client) => {
  if (userId === friendId) throw new AppError(400, 'INVALID_REQUEST', 'Cannot remove yourself as a friend');
  await lockUserPair(client, userId, friendId);
  const { rows } = await client.query(
    `DELETE FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND receiver_id = $2)
         OR (requester_id = $2 AND receiver_id = $1))
     RETURNING id`,
    [userId, friendId]
  );
  if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', 'Friend not found');
  return { ok: true };
});

export const blockUser = async (userId, blockedId) => withTransaction(async (client) => {
  if (userId === blockedId) throw new AppError(400, 'INVALID_REQUEST', 'Cannot block yourself');
  await lockUserPair(client, userId, blockedId);
  await client.query(
    `INSERT INTO blocks (blocker_id, blocked_id)
     VALUES ($1, $2)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
    [userId, blockedId]
  );
  await client.query(
    `DELETE FROM friendships
     WHERE (requester_id = $1 AND receiver_id = $2)
        OR (requester_id = $2 AND receiver_id = $1)`,
    [userId, blockedId]
  );
  return { ok: true };
});

export const unblockUser = async (userId, blockedId) => {
  const { rows } = await query(
    'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING id',
    [userId, blockedId]
  );
  if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', 'Block not found');
  return { ok: true };
};

export const getBlockedUsers = async (userId) => {
  const { rows } = await query(
    `SELECT b.blocked_id AS user_id, u.username
     FROM blocks b
     JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1
     ORDER BY u.username ASC`,
    [userId]
  );
  return { items: rows };
};
