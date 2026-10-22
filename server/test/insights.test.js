import { DateTime } from 'luxon';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  cleanDb,
  createTestSubject,
  createTestUser,
  getTestPool,
  setupTestDb,
  teardownTestDb,
} from './test-helper.js';

describe('Statistics insights', () => {
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

  it('requires authentication and returns subject-behind and best-time insights with exact numbers', async () => {
    const { user, cookie } = await createTestUser({ time_zone: 'Asia/Kolkata' });
    const subject = await createTestSubject(user.id, { name: 'Physics' });
    const today = DateTime.now().setZone(user.time_zone).startOf('day');
    const weekStart = today.startOf('week').toISODate();
    const pool = getTestPool();

    expect((await request(app).get('/api/stats/insights')).status).toBe(401);

    await pool.query(
      `INSERT INTO planner_goals (user_id, date, subject_id, text, target_seconds)
       VALUES ($1, $2, $3, 'Study physics', 3600)`,
      [user.id, weekStart, subject.id]
    );
    await pool.query(
      `INSERT INTO subject_daily_totals (user_id, subject_id, day, minutes)
       VALUES ($1, $2, $3, 20)`,
      [user.id, subject.id, today.toISODate()]
    );

    const sessionStart = today.minus({ days: 1 }).set({ hour: 18 }).toUTC().toJSDate();
    const sessionEnd = new Date(sessionStart.getTime() + 1800 * 1000);
    const otherHourStart = today.minus({ days: 2 }).set({ hour: 19 }).toUTC().toJSDate();
    const otherHourEnd = new Date(otherHourStart.getTime() + 3600 * 1000);
    const outsideWindowStart = today.minus({ days: 30 }).set({ hour: 18 }).toUTC().toJSDate();
    const outsideWindowEnd = new Date(outsideWindowStart.getTime() + 7200 * 1000);

    for (const [start, end, seconds] of [
      [sessionStart, sessionEnd, 1800],
      [otherHourStart, otherHourEnd, 3600],
      [outsideWindowStart, outsideWindowEnd, 7200],
    ]) {
      await pool.query(
        `INSERT INTO sessions (user_id, subject_id, started_at, ended_at, segment_started_at,
                               status, study_seconds)
         VALUES ($1, $2, $3, $4, $3, 'ended', $5)`,
        [user.id, subject.id, start, end, seconds]
      );
    }

    const response = await request(app)
      .get('/api/stats/insights')
      .set('Cookie', [cookie]);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      {
        kind: 'subject_behind',
        text: 'Physics got less time than planned this week.',
        numbers: { logged_seconds: 1200, planned_seconds: 3600 },
      },
      {
        kind: 'best_time',
        text: 'You study most between 6 pm and 8 pm.',
        numbers: { start_hour: 18, end_hour: 20, share_percent: 100 },
      },
    ]);
  });

  it('returns an empty insight list when there are no goals or eligible study sessions', async () => {
    const { cookie } = await createTestUser({ time_zone: 'Asia/Kolkata' });
    const response = await request(app)
      .get('/api/stats/insights')
      .set('Cookie', [cookie]);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });
});
