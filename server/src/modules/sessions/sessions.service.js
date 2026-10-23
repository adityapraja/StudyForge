import { DateTime } from 'luxon';
import { query, withTransaction } from '../../db.js';
import { AppError } from '../../middleware/error-handler.js';
import { executeSessionEndTransaction } from './session-end.transaction.js';

export const formatSession = (session) => {
  if (!session) return null;
  return {
    id: session.id,
    subject_id: session.subject_id,
    started_at:
      session.started_at instanceof Date
        ? session.started_at.toISOString()
        : session.started_at,
    ended_at: session.ended_at
      ? session.ended_at instanceof Date
        ? session.ended_at.toISOString()
        : session.ended_at
      : null,
    status: session.status,
    paused_seconds: session.paused_seconds,
    break_seconds: session.break_seconds,
    segment_started_at:
      session.segment_started_at instanceof Date
        ? session.segment_started_at.toISOString()
        : session.segment_started_at,
    study_seconds: session.study_seconds,
    note: session.note,
    source: session.source,
    verified: session.verified,
  };
};

export const startSession = async (user, { subject_id }) => {
  // Verify subject exists and belongs to user
  const { rows: subjectRows } = await query(
    `SELECT id FROM subjects WHERE id = $1 AND user_id = $2`,
    [subject_id, user.id]
  );
  if (subjectRows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Subject not found');
  }

  // Check if user already has an open session
  const { rows: openSessions } = await query(
    `SELECT * FROM sessions WHERE user_id = $1 AND ended_at IS NULL`,
    [user.id]
  );

  if (openSessions.length > 0) {
    throw new AppError(
      409,
      'SESSION_ALREADY_OPEN',
      'You already have an open session.',
      null,
      { open_session: formatSession(openSessions[0]) }
    );
  }

  // Stamped with server clock
  const now = new Date();
  const { rows } = await query(
    `INSERT INTO sessions (user_id, subject_id, started_at, segment_started_at, status, paused_seconds, break_seconds, source, verified)
     VALUES ($1, $2, $3, $4, 'running', 0, 0, 'timer', true)
     RETURNING *`,
    [user.id, subject_id, now, now]
  );

  return formatSession(rows[0]);
};

export const getActiveSession = async (userId) => {
  const { rows } = await query(
    `SELECT * FROM sessions WHERE user_id = $1 AND ended_at IS NULL`,
    [userId]
  );

  if (rows.length === 0) {
    return { session: null };
  }

  return formatSession(rows[0]);
};

export const pauseSession = async (userId, sessionId) => {
  const { rows } = await query(
    `SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [sessionId, userId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Open session not found');
  }

  const session = rows[0];
  if (session.status !== 'running') {
    throw new AppError(409, 'INVALID_STATE', 'Cannot pause a session that is not running');
  }

  const now = new Date();
  const { rows: updated } = await query(
    `UPDATE sessions
     SET status = 'paused', segment_started_at = $1
     WHERE id = $2
     RETURNING *`,
    [now, sessionId]
  );

  return formatSession(updated[0]);
};

export const breakSession = async (userId, sessionId) => {
  const { rows } = await query(
    `SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [sessionId, userId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Open session not found');
  }

  const session = rows[0];
  if (session.status !== 'running') {
    throw new AppError(409, 'INVALID_STATE', 'Cannot take a break from a session that is not running');
  }

  const now = new Date();
  const { rows: updated } = await query(
    `UPDATE sessions
     SET status = 'on_break', segment_started_at = $1
     WHERE id = $2
     RETURNING *`,
    [now, sessionId]
  );

  return formatSession(updated[0]);
};

export const resumeSession = async (userId, sessionId) => {
  const { rows } = await query(
    `SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [sessionId, userId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Open session not found');
  }

  const session = rows[0];
  const now = new Date();
  const segmentStart = new Date(session.segment_started_at);
  const elapsedSegment = Math.max(0, Math.floor((now.getTime() - segmentStart.getTime()) / 1000));

  if (session.status === 'paused') {
    const newPausedSeconds = session.paused_seconds + elapsedSegment;
    const { rows: updated } = await query(
      `UPDATE sessions
       SET status = 'running', segment_started_at = $1, paused_seconds = $2
       WHERE id = $3
       RETURNING *`,
      [now, newPausedSeconds, sessionId]
    );
    return formatSession(updated[0]);
  } else if (session.status === 'on_break') {
    const newBreakSeconds = session.break_seconds + elapsedSegment;
    const { rows: updated } = await query(
      `UPDATE sessions
       SET status = 'running', segment_started_at = $1, break_seconds = $2
       WHERE id = $3
       RETURNING *`,
      [now, newBreakSeconds, sessionId]
    );
    return formatSession(updated[0]);
  } else {
    throw new AppError(409, 'INVALID_STATE', 'Cannot resume a session that is not paused or on break');
  }
};

export const stopSession = async (user, sessionId, { note } = {}) => {
  return await withTransaction(async (client) => {
    await client.query(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [user.id]
    );
    const { rows } = await client.query(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND ended_at IS NULL FOR UPDATE`,
      [sessionId, user.id]
    );

    if (rows.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Open session not found');
    }

    const session = rows[0];
    const result = await executeSessionEndTransaction(client, user, session, { note });

    return {
      session: formatSession(result.session),
      summary: result.summary,
    };
  });
};

export const createManualSession = async (
  user,
  { subject_id, started_at, ended_at, note }
) => {
  const start = new Date(started_at);
  const end = new Date(ended_at);
  const now = new Date();

  if (end.getTime() <= start.getTime()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ended_at must be after started_at');
  }

  if (start.getTime() > now.getTime() || end.getTime() > now.getTime()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Session cannot be in the future');
  }

  // Verify subject exists and belongs to user
  const { rows: subjectRows } = await query(
    `SELECT id FROM subjects WHERE id = $1 AND user_id = $2`,
    [subject_id, user.id]
  );
  if (subjectRows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Subject not found');
  }

  // Check for overlapping session
  const { rows: overlaps } = await query(
    `SELECT id FROM sessions
     WHERE user_id = $1
       AND (
         (ended_at IS NULL AND started_at < $3)
         OR
         (started_at < $3 AND ended_at > $2)
       )`,
    [user.id, start, end]
  );

  if (overlaps.length > 0) {
    throw new AppError(409, 'SESSION_OVERLAP', 'Session overlaps with an existing session');
  }

  const studySeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));

  return await withTransaction(async (client) => {
    await client.query(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [user.id]
    );
    const { rows } = await client.query(
      `INSERT INTO sessions (user_id, subject_id, started_at, ended_at, status, paused_seconds, break_seconds, segment_started_at, study_seconds, note, source, verified)
       VALUES ($1, $2, $3, $4, 'ended', 0, 0, $3, $5, $6, 'manual', false)
       RETURNING *`,
      [user.id, subject_id, start, end, studySeconds, note || null]
    );

    const insertedSession = rows[0];

    // Run session-end accounting (daily_totals, streak)
    await executeSessionEndTransaction(client, user, insertedSession, {
      endedAt: end,
      note,
    });

    return formatSession(insertedSession);
  });
};

export const listSessions = async (user, filters = {}) => {
  const conditions = ['user_id = $1'];
  const values = [user.id];
  let paramIndex = 2;

  const zone = user.time_zone || 'UTC';

  if (filters.from) {
    const fromDate = DateTime.fromISO(filters.from, { zone }).startOf('day').toJSDate();
    conditions.push(`started_at >= $${paramIndex++}`);
    values.push(fromDate);
  }

  if (filters.to) {
    const toDate = DateTime.fromISO(filters.to, { zone }).endOf('day').toJSDate();
    conditions.push(`started_at <= $${paramIndex++}`);
    values.push(toDate);
  }

  if (filters.q) {
    conditions.push(`note ILIKE $${paramIndex++}`);
    values.push(`%${filters.q}%`);
  }

  if (filters.subject_id) {
    conditions.push(`subject_id = $${paramIndex++}`);
    values.push(filters.subject_id);
  }

  if (filters.cursor) {
    try {
      const decoded = Buffer.from(filters.cursor, 'base64').toString('utf8');
      const { started_at, id } = JSON.parse(decoded);
      conditions.push(`(started_at, id) < ($${paramIndex++}, $${paramIndex++})`);
      values.push(new Date(started_at), id);
    } catch (e) {
      // Invalid cursor ignored
    }
  }

  const limit = Math.min(200, Math.max(1, filters.limit || 50));
  values.push(limit + 1);

  const sql = `
    SELECT * FROM sessions
    WHERE ${conditions.join(' AND ')}
    ORDER BY started_at DESC, id DESC
    LIMIT $${paramIndex}
  `;

  const { rows } = await query(sql, values);

  let nextCursor = null;
  if (rows.length > limit) {
    const lastItem = rows[limit - 1];
    const cursorPayload = JSON.stringify({
      started_at: lastItem.started_at,
      id: lastItem.id,
    });
    nextCursor = Buffer.from(cursorPayload, 'utf8').toString('base64');
    rows.pop(); // Remove extra item
  }

  return {
    items: rows.map(formatSession),
    next_cursor: nextCursor,
  };
};

export const deleteSession = async (userId, sessionId) => {
  const { rows } = await query(
    `DELETE FROM sessions WHERE id = $1 AND user_id = $2 RETURNING id`,
    [sessionId, userId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found');
  }

  return { ok: true };
};
