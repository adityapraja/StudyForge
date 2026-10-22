import { DateTime } from 'luxon';
import { query } from '../../db.js';

const getRange = (range, timeZone) => {
  const today = DateTime.now().setZone(timeZone).startOf('day');
  if (range === 'year') {
    return {
      start: today.startOf('month').minus({ months: 11 }),
      end: today,
      pointCount: 12,
      unit: 'month',
    };
  }
  const pointCount = range === 'week' ? 7 : 30;
  return {
    start: today.minus({ days: pointCount - 1 }),
    end: today,
    pointCount,
    unit: 'day',
  };
};

const makePoints = ({ start, pointCount, unit }) => Array.from(
  { length: pointCount },
  (_, index) => {
    const point = start.plus(unit === 'month' ? { months: index } : { days: index });
    return {
      label: unit === 'month' ? point.toFormat('yyyy-MM') : point.toISODate(),
      seconds: 0,
    };
  }
);

export const getHeatmap = async (userId, timeZone, requestedYear) => {
  const year = requestedYear ?? DateTime.now().setZone(timeZone).year;
  const { rows } = await query(
    `SELECT day::text AS date, minutes * 60 AS seconds
     FROM daily_totals
     WHERE user_id = $1 AND day >= $2 AND day < $3 AND minutes > 0
     ORDER BY day`,
    [userId, `${year}-01-01`, `${year + 1}-01-01`]
  );
  return {
    year,
    days: rows,
    max_seconds: rows.reduce((max, row) => Math.max(max, row.seconds), 0),
  };
};

export const getProgress = async (userId, timeZone, range) => {
  const bounds = getRange(range, timeZone);
  const points = makePoints(bounds);
  const labelExpression = bounds.unit === 'month'
    ? `to_char(day, 'YYYY-MM')`
    : 'day::text';
  const { rows } = await query(
    `SELECT ${labelExpression} AS label, (SUM(minutes) * 60)::integer AS seconds
     FROM daily_totals
     WHERE user_id = $1 AND day >= $2 AND day <= $3
     GROUP BY 1`,
    [userId, bounds.start.toISODate(), bounds.end.toISODate()]
  );
  const values = new Map(rows.map((row) => [row.label, row.seconds]));
  points.forEach((point) => { point.seconds = values.get(point.label) || 0; });
  const totalSeconds = points.reduce((total, point) => total + point.seconds, 0);
  return {
    range,
    points,
    total_seconds: totalSeconds,
    daily_average_seconds: Math.round(totalSeconds / points.length),
  };
};

export const getSubjectStats = async (userId, timeZone, range) => {
  const bounds = getRange(range, timeZone);
  const { rows } = await query(
    `SELECT subject.id AS subject_id, subject.name, subject.color,
            (SUM(totals.minutes) * 60)::integer AS seconds
     FROM subject_daily_totals totals
     JOIN subjects subject ON subject.id = totals.subject_id
     WHERE totals.user_id = $1 AND totals.day >= $2 AND totals.day <= $3
     GROUP BY subject.id, subject.name, subject.color
     ORDER BY seconds DESC, subject.name`,
    [userId, bounds.start.toISODate(), bounds.end.toISODate()]
  );
  const totalSeconds = rows.reduce((total, subject) => total + subject.seconds, 0);
  return {
    range,
    subjects: rows.map((subject) => ({
      ...subject,
      percent: totalSeconds ? Math.round((subject.seconds * 100) / totalSeconds) : 0,
    })),
    total_seconds: totalSeconds,
  };
};