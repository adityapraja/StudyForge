import { query } from '../../db.js';
import { AppError } from '../../middleware/error-handler.js';

export const getUserSubjects = async (userId) => {
  const { rows } = await query(
    `SELECT id, name, color FROM subjects WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
  return rows;
};

export const createSubject = async (userId, { name, color }) => {
  const { rows: existing } = await query(
    `SELECT id FROM subjects WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
    [userId, name]
  );

  if (existing.length > 0) {
    throw new AppError(409, 'SUBJECT_NAME_TAKEN', 'Subject name already exists');
  }

  const { rows } = await query(
    `INSERT INTO subjects (user_id, name, color)
     VALUES ($1, $2, $3)
     RETURNING id, name, color`,
    [userId, name, color]
  );

  return rows[0];
};

export const updateSubject = async (userId, subjectId, data) => {
  const { rows: existing } = await query(
    `SELECT id, name, color FROM subjects WHERE id = $1 AND user_id = $2`,
    [subjectId, userId]
  );

  if (existing.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Subject not found');
  }

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    const { rows: duplicate } = await query(
      `SELECT id FROM subjects WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND id != $3`,
      [userId, data.name, subjectId]
    );
    if (duplicate.length > 0) {
      throw new AppError(409, 'SUBJECT_NAME_TAKEN', 'Subject name already exists');
    }
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }

  if (data.color !== undefined) {
    updates.push(`color = $${paramIndex++}`);
    values.push(data.color);
  }

  if (updates.length === 0) {
    return existing[0];
  }

  updates.push(`updated_at = NOW()`);
  values.push(subjectId, userId);

  const { rows } = await query(
    `UPDATE subjects
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
     RETURNING id, name, color`,
    values
  );

  return rows[0];
};

export const deleteSubject = async (userId, subjectId) => {
  const { rows } = await query(
    `DELETE FROM subjects WHERE id = $1 AND user_id = $2 RETURNING id`,
    [subjectId, userId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Subject not found');
  }

  return { ok: true };
};

