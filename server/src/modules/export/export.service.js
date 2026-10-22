import { query } from '../../db.js';

const escapeCsv = (value) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export const exportSessionsCsv = async (userId, timeZone) => {
  const { rows } = await query(
    `SELECT (s.started_at AT TIME ZONE $2)::date::text AS date,
            subject.name AS subject,
            s.started_at,
            s.ended_at,
            ROUND(s.study_seconds::numeric / 60, 2) AS duration_minutes,
            s.note
     FROM sessions s
     JOIN subjects subject
       ON subject.id = s.subject_id AND subject.user_id = s.user_id
     WHERE s.user_id = $1 AND s.ended_at IS NOT NULL
     ORDER BY s.started_at, s.id`,
    [userId, timeZone || 'UTC']
  );
  const lines = [
    ['date', 'subject', 'start', 'end', 'duration_minutes', 'note'].map(escapeCsv).join(','),
    ...rows.map((row) => [
      row.date,
      row.subject,
      row.started_at?.toISOString?.() ?? row.started_at,
      row.ended_at?.toISOString?.() ?? row.ended_at,
      row.duration_minutes,
      row.note,
    ].map(escapeCsv).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
};