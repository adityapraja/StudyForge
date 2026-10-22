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

export const getInsights = async (userId, timeZone) => {
  const today = DateTime.now().setZone(timeZone).startOf('day');
  const weekStart = today.startOf('week').toISODate();
  const weekEnd = today.endOf('week').toISODate();
  const { rows: behindSubjects } = await query(
    `SELECT subject.id AS subject_id, subject.name,
            COALESCE(logged.seconds, 0)::integer AS logged_seconds,
            COALESCE(planned.seconds, 0)::integer AS planned_seconds
     FROM subjects subject
     LEFT JOIN (
       SELECT subject_id, SUM(minutes) * 60 AS seconds
       FROM subject_daily_totals
       WHERE user_id = $1 AND day >= $2 AND day <= $3
       GROUP BY subject_id
     ) logged ON logged.subject_id = subject.id
     LEFT JOIN (
       SELECT subject_id, SUM(target_seconds) AS seconds
       FROM planner_goals
       WHERE user_id = $1 AND date >= $2 AND date <= $3 AND subject_id IS NOT NULL
       GROUP BY subject_id
     ) planned ON planned.subject_id = subject.id
     WHERE subject.user_id = $1
       AND COALESCE(planned.seconds, 0) > COALESCE(logged.seconds, 0)
     ORDER BY subject.name, subject.id`,
    [userId, weekStart, weekEnd]
  );

  const weekItems = behindSubjects.map((subject) => ({
    kind: 'subject_behind',
    text: `${subject.name} got less time than planned this week.`,
    numbers: {
      logged_seconds: subject.logged_seconds,
      planned_seconds: subject.planned_seconds,
    },
  }));

  const bestTimeStart = today.minus({ days: 29 });
  const tomorrow = today.plus({ days: 1 });
  const { rows: hourlyTotals } = await query(
    `SELECT EXTRACT(HOUR FROM started_at AT TIME ZONE $2)::integer AS start_hour,
            SUM(study_seconds)::integer AS seconds
     FROM sessions
     WHERE user_id = $1
       AND ended_at IS NOT NULL
       AND study_seconds > 0
       AND started_at >= $3
       AND started_at < $4
     GROUP BY 1`,
    [
      userId,
      timeZone,
      bestTimeStart.toUTC().toISO(),
      tomorrow.toUTC().toISO(),
    ]
  );
  const hourlySeconds = Array(24).fill(0);
  for (const row of hourlyTotals) hourlySeconds[row.start_hour] = row.seconds;
  const totalSeconds = hourlySeconds.reduce((sum, seconds) => sum + seconds, 0);

  let bestWindowStart = 0;
  let bestWindowSeconds = 0;
  for (let hour = 0; hour < 24; hour += 1) {
    const windowSeconds = hourlySeconds[hour] + hourlySeconds[(hour + 1) % 24];
    if (windowSeconds > bestWindowSeconds) {
      bestWindowStart = hour;
      bestWindowSeconds = windowSeconds;
    }
  }

  const items = [...weekItems];
  if (totalSeconds > 0) {
    const endHour = (bestWindowStart + 2) % 24;
    const formatHour = (hour) => `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;
    items.push({
      kind: 'best_time',
      text: `You study most between ${formatHour(bestWindowStart)} and ${formatHour(endHour)}.`,
      numbers: {
        start_hour: bestWindowStart,
        end_hour: endHour,
        share_percent: Math.round((bestWindowSeconds * 100) / totalSeconds),
      },
    });
  }
  return { items };
};