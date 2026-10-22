import { DateTime } from 'luxon';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, cleanDb, createTestUser, createTestSubject, getTestPool } from './test-helper.js';

describe('Statistics module', () => {
  let app;

  beforeAll(async () => {
    await setupTestDb();
    app = createApp();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  it('returns local-day heatmap, zero-filled progress, and subject totals for only the user', async () => {
    const { user, cookie } = await createTestUser({ time_zone: 'UTC' });
    const other = await createTestUser({ time_zone: 'UTC' });
    const physics = await createTestSubject(user.id, { name: 'Physics' });
    const history = await createTestSubject(user.id, { name: 'History', color: '#00AA11' });
    const foreignSubject = await createTestSubject(other.user.id, { name: 'Private' });
    const today = DateTime.now().toUTC().toISODate();
    const yesterday = DateTime.now().toUTC().minus({ days: 1 }).toISODate();
    const pool = getTestPool();

    await pool.query(
      `INSERT INTO daily_totals (user_id, day, minutes)
       VALUES ($1, $2, 60), ($1, $3, 30), ($4, $2, 900)`,
      [user.id, today, yesterday, other.user.id]
    );
    await pool.query(
      `INSERT INTO subject_daily_totals (user_id, subject_id, day, minutes)
       VALUES ($1, $2, $3, 40), ($1, $4, $3, 20), ($5, $6, $3, 900)`,
      [user.id, physics.id, today, history.id, other.user.id, foreignSubject.id]
    );

    const heatmap = await request(app)
      .get(`/api/stats/heatmap?year=${DateTime.now().year}`)
      .set('Cookie', [cookie]);
    expect(heatmap.status).toBe(200);
    expect(heatmap.body.days).toContainEqual({ date: today, seconds: 3600 });
    expect(heatmap.body.days).toContainEqual({ date: yesterday, seconds: 1800 });
    expect(heatmap.body.days).toHaveLength(2);

    const progress = await request(app)
      .get('/api/stats/progress?range=week')
      .set('Cookie', [cookie]);
    expect(progress.status).toBe(200);
    expect(progress.body.points).toHaveLength(7);
    expect(progress.body.total_seconds).toBe(5400);
    expect(progress.body.daily_average_seconds).toBe(771);
    expect(progress.body.points.find((point) => point.label === today).seconds).toBe(3600);

    const subjects = await request(app)
      .get('/api/stats/subjects?range=week')
      .set('Cookie', [cookie]);
    expect(subjects.status).toBe(200);
    expect(subjects.body.total_seconds).toBe(3600);
    expect(subjects.body.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject_id: physics.id, seconds: 2400, percent: 67 }),
      expect.objectContaining({ subject_id: history.id, seconds: 1200, percent: 33 }),
    ]));
    expect(subjects.body.subjects).toHaveLength(2);
  });

  it('returns empty statistics and validates range parameters', async () => {
    const { cookie } = await createTestUser();
    const empty = await request(app)
      .get('/api/stats/subjects?range=week')
      .set('Cookie', [cookie]);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ range: 'week', subjects: [], total_seconds: 0 });

    const invalid = await request(app)
      .get('/api/stats/progress?range=decade')
      .set('Cookie', [cookie]);
    expect(invalid.status).toBe(400);
  });

  it('uses inclusive 30-day and 12-month local date windows', async () => {
    const { user, cookie } = await createTestUser({ time_zone: 'UTC' });
    const today = DateTime.now().toUTC().startOf('day');
    const monthStart = today.minus({ days: 29 }).toISODate();
    const outsideMonth = today.minus({ days: 30 }).toISODate();
    const yearStart = today.startOf('month').minus({ months: 11 }).toISODate();
    const outsideYear = today.startOf('month').minus({ months: 12 }).toISODate();
    await getTestPool().query(
      `INSERT INTO daily_totals (user_id, day, minutes)
       VALUES ($1, $2, 20), ($1, $3, 900), ($1, $4, 30), ($1, $5, 800)`,
      [user.id, monthStart, outsideMonth, yearStart, outsideYear]
    );

    const month = await request(app)
      .get('/api/stats/progress?range=month')
      .set('Cookie', [cookie]);
    expect(month.status).toBe(200);
    expect(month.body.points).toHaveLength(30);
    expect(month.body.points[0].label).toBe(monthStart);
    expect(month.body.total_seconds).toBe(1200);

    const year = await request(app)
      .get('/api/stats/progress?range=year')
      .set('Cookie', [cookie]);
    expect(year.status).toBe(200);
    expect(year.body.points).toHaveLength(12);
    expect(year.body.points[0].label).toBe(yearStart.slice(0, 7));
    expect(year.body.total_seconds).toBe(57000);
  });

  it('includes manual sessions in daily and subject statistics', async () => {
    const { user, cookie } = await createTestUser({ time_zone: 'UTC' });
    const subject = await createTestSubject(user.id);
    const endedAt = new Date(Date.now() - 30 * 60 * 1000);
    const startedAt = new Date(endedAt.getTime() - 30 * 60 * 1000);

    const manual = await request(app)
      .post('/api/sessions/manual')
      .set('Cookie', [cookie])
      .send({
        subject_id: subject.id,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        note: 'manual test entry',
      });
    expect(manual.status).toBe(201);

    const stats = await request(app)
      .get('/api/stats/subjects?range=week')
      .set('Cookie', [cookie]);
    expect(stats.status).toBe(200);
    expect(stats.body.subjects).toEqual([
      expect.objectContaining({ subject_id: subject.id, seconds: 1800, percent: 100 }),
    ]);

    const today = DateTime.fromJSDate(endedAt, { zone: 'UTC' }).toISODate();
    const daily = await getTestPool().query(
      'SELECT minutes FROM daily_totals WHERE user_id = $1 AND day = $2',
      [user.id, today]
    );
    expect(daily.rows[0].minutes).toBe(30);
  });
});