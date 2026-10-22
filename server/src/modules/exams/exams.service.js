import { DateTime } from 'luxon';
import { query } from '../../db.js';
import { AppError } from '../../middleware/error-handler.js';

const roundToOneDecimal = (value) => Math.round(value * 10) / 10;

const formatDate = (value) => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : String(value).slice(0, 10);

const serializeExam = (exam, today) => {
  const date = formatDate(exam.date);
  const daysLeft = Math.max(0, Math.round(
    DateTime.fromISO(date, { zone: today.zoneName }).startOf('day').diff(today, 'days').days
  ));
  const loggedHours = Number(exam.logged_seconds) / 3600;
  const targetHours = exam.target_hours === null ? null : Number(exam.target_hours);
  const hoursNeeded = targetHours === null || loggedHours >= targetHours
    ? null
    : roundToOneDecimal((targetHours - loggedHours) / Math.max(daysLeft, 1));

  return {
    id: exam.id,
    subject_id: exam.subject_id,
    date,
    target_hours: targetHours,
    days_left: daysLeft,
    logged_hours: roundToOneDecimal(loggedHours),
    hours_needed_per_day: hoursNeeded,
  };
};

const getUserLocalToday = (timeZone) => DateTime.now().setZone(timeZone).startOf('day');

const getExam = async (userId, examId, timeZone) => {
  const today = getUserLocalToday(timeZone);
  const { rows } = await query(
    `SELECT exams.id, exams.subject_id, exams.date::text AS date, exams.target_hours,
            COALESCE(SUM(sessions.study_seconds), 0)::integer AS logged_seconds
     FROM exams
     LEFT JOIN sessions
       ON sessions.user_id = exams.user_id
      AND sessions.subject_id = exams.subject_id
      AND sessions.ended_at IS NOT NULL
       AND sessions.started_at >= exams.created_at
     WHERE exams.user_id = $1 AND exams.id = $2
     GROUP BY exams.id`,
    [userId, examId]
  );
  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Exam not found');
  }
  return serializeExam(rows[0], today);
};

export const getExams = async (userId, timeZone) => {
  const today = getUserLocalToday(timeZone);
  const { rows } = await query(
    `SELECT exams.id, exams.subject_id, exams.date::text AS date, exams.target_hours,
            COALESCE(SUM(sessions.study_seconds), 0)::integer AS logged_seconds
     FROM exams
     LEFT JOIN sessions
       ON sessions.user_id = exams.user_id
      AND sessions.subject_id = exams.subject_id
      AND sessions.ended_at IS NOT NULL
       AND sessions.started_at >= exams.created_at
     WHERE exams.user_id = $1 AND exams.date >= $2
     GROUP BY exams.id
     ORDER BY exams.date, exams.created_at, exams.id`,
    [userId, today.toISODate()]
  );
  return rows.map((exam) => serializeExam(exam, today));
};

export const createExam = async (userId, data, timeZone) => {
  const { rows: subjects } = await query(
    'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
    [data.subject_id, userId]
  );
  if (subjects.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Subject not found');
  }
  const { rows } = await query(
    `INSERT INTO exams (user_id, subject_id, date, target_hours)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, data.subject_id, data.date, data.target_hours ?? null]
  );
  return getExam(userId, rows[0].id, timeZone);
};

export const updateExam = async (userId, examId, data, timeZone) => {
  if (data.subject_id !== undefined) {
    const { rows: subjects } = await query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
      [data.subject_id, userId]
    );
    if (subjects.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Subject not found');
    }
  }

  const assignments = [];
  const values = [];
  for (const field of ['subject_id', 'date', 'target_hours']) {
    if (data[field] !== undefined) {
      values.push(data[field]);
      assignments.push(`${field} = $${values.length}`);
    }
  }
  values.push(examId, userId);
  const { rows } = await query(
    `UPDATE exams
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND user_id = $${values.length}
     RETURNING id`,
    values
  );
  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Exam not found');
  }
  return getExam(userId, examId, timeZone);
};

export const deleteExam = async (userId, examId) => {
  const { rows } = await query(
    'DELETE FROM exams WHERE id = $1 AND user_id = $2 RETURNING id',
    [examId, userId]
  );
  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Exam not found');
  }
  return { ok: true };
};
