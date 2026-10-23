import { query } from '../../db.js';

const privacyFields = new Set(['weekly_time', 'subjects']);

export const canViewMany = async (viewerId, targetIds, field, client = null) => {
  if (!viewerId || !privacyFields.has(field) || targetIds.length === 0) {
    return new Set();
  }

  const execute = client ? client.query.bind(client) : query;
  const { rows } = await execute(
    `SELECT target.id
     FROM users target
     WHERE target.id = ANY($2::uuid[])
       AND (
         target.id = $1
         OR (
           COALESCE(target.privacy ->> $3, 'nobody') = 'everyone'
           AND NOT EXISTS (
             SELECT 1 FROM blocks
             WHERE (blocker_id = $1 AND blocked_id = target.id)
                OR (blocker_id = target.id AND blocked_id = $1)
           )
         )
         OR (
           COALESCE(target.privacy ->> $3, 'nobody') = 'friends'
           AND EXISTS (
             SELECT 1 FROM friendships
             WHERE status = 'accepted'
               AND (
                 (requester_id = $1 AND receiver_id = target.id)
                 OR (requester_id = target.id AND receiver_id = $1)
               )
           )
           AND NOT EXISTS (
             SELECT 1 FROM blocks
             WHERE (blocker_id = $1 AND blocked_id = target.id)
                OR (blocker_id = target.id AND blocked_id = $1)
           )
         )
       )`,
    [viewerId, targetIds, field]
  );
  return new Set(rows.map((row) => row.id));
};

export const canView = async (viewerId, targetId, field, client = null) => {
  if (!viewerId || !targetId) return false;
  const visibleIds = await canViewMany(viewerId, [targetId], field, client);
  return visibleIds.has(targetId);
};
