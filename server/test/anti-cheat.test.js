import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, cleanDb, createTestUser, createTestSubject, getTestPool } from './test-helper.js';
import { splitSessionAcrossDays } from '../src/modules/sessions/session-end.transaction.js';

describe('Anti-Cheat, Limits & Time Zone Boundaries', () => {
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

  describe('Manual Sessions Anti-Cheat', () => {
    it('saves manual session with verified = false, adds to minutes but NOT verified_minutes, and awards 0 XP', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const oneHourAgo = new Date(Date.now() - 1 * 3600 * 1000).toISOString();

      const res = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: twoHoursAgo,
          ended_at: oneHourAgo,
          note: 'Forgot to start timer',
        });

      expect(res.status).toBe(201);
      expect(res.body.source).toBe('manual');
      expect(res.body.verified).toBe(false);
      expect(res.body.study_seconds).toBe(3600);

      // Verify no XP was awarded
      const pool = getTestPool();
      const { rows: userRows } = await pool.query('SELECT xp FROM users WHERE id = $1', [user.id]);
      expect(userRows[0].xp).toBe(0);

      // Verify daily_totals: minutes updated (for personal tracking), verified_minutes remains 0 (anti-cheat)
      const { rows: dtRows } = await pool.query(
        'SELECT minutes, verified_minutes FROM daily_totals WHERE user_id = $1',
        [user.id]
      );
      expect(dtRows.length).toBe(1);
      expect(dtRows[0].minutes).toBe(60);
      expect(dtRows[0].verified_minutes).toBe(0);
    });

    it('rejects overlapping sessions with 409 SESSION_OVERLAP', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const base = Date.now() - 5 * 3600 * 1000;
      const start1 = new Date(base).toISOString();
      const end1 = new Date(base + 2 * 3600 * 1000).toISOString();

      // First manual session: base to base + 2h
      await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: start1,
          ended_at: end1,
        });

      // Second manual session overlapping: base + 1h to base + 3h
      const start2 = new Date(base + 1 * 3600 * 1000).toISOString();
      const end2 = new Date(base + 3 * 3600 * 1000).toISOString();

      const res = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: start2,
          ended_at: end2,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SESSION_OVERLAP');
    });

    it('rejects manual session where ended_at <= started_at or in the future', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const now = Date.now();
      const resPast = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: new Date(now - 1000).toISOString(),
          ended_at: new Date(now - 5000).toISOString(),
        });
      expect(resPast.status).toBe(400);

      const resFuture = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: new Date(now).toISOString(),
          ended_at: new Date(now + 3600 * 1000).toISOString(),
        });
      expect(resFuture.status).toBe(400);
    });
  });

  describe('Session Caps & Limits', () => {
    it('caps XP at 4 hours (240 XP) even for longer sessions', async () => {
      const { user, cookie } = await createTestUser({ daily_target_seconds: 36000 });
      const subject = await createTestSubject(user.id);

      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      // Simulate a 5-hour session (18,000 seconds = 300 minutes)
      const pool = getTestPool();
      await pool.query(
        `UPDATE sessions SET started_at = NOW() - INTERVAL '5 hours' WHERE id = $1`,
        [sessionId]
      );

      const stopRes = await request(app)
        .post(`/api/sessions/${sessionId}/stop`)
        .set('Cookie', [cookie]);

      expect(stopRes.status).toBe(200);
      // Study time is ~5 hours (300 minutes)
      expect(stopRes.body.summary.study_seconds).toBeGreaterThanOrEqual(17900);
      // But XP is capped at 4 hours = 240 XP!
      expect(stopRes.body.summary.xp_awarded).toBe(240);

      const { rows } = await pool.query('SELECT xp FROM users WHERE id = $1', [user.id]);
      expect(rows[0].xp).toBe(240);
    });

    it('enforces 16-hour daily cap on counted study time in daily_totals', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const pool = getTestPool();
      const today = DateTime.now().setZone(user.time_zone).toISODate();

      // Seed 15 hours (900 minutes) already logged today
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
         VALUES ($1, $2, 900, 900)`,
        [user.id, today]
      );

      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      // Simulate a 2-hour session (120 minutes)
      await pool.query(
        `UPDATE sessions SET started_at = NOW() - INTERVAL '2 hours' WHERE id = $1`,
        [sessionId]
      );

      const stopRes = await request(app)
        .post(`/api/sessions/${sessionId}/stop`)
        .set('Cookie', [cookie]);

      expect(stopRes.status).toBe(200);
      // Study seconds = 7200 (2h)
      expect(stopRes.body.summary.study_seconds).toBeGreaterThanOrEqual(7190);
      // But only 1 hour (3600 seconds = 60 minutes) could be counted before reaching the 16h cap!
      expect(stopRes.body.summary.counted_seconds).toBe(3600);

      // daily_totals should be capped at 960 minutes (16 hours)
      const { rows } = await pool.query(
        `SELECT minutes, verified_minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
        [user.id, today]
      );
      expect(rows[0].minutes).toBe(960);
      expect(rows[0].verified_minutes).toBe(960);
    });
  });

  describe('Midnight Splitting in User Time Zone', () => {
    it('splits a session crossing midnight across two local calendar days in daily_totals', async () => {
      // Create user in Asia/Kolkata (UTC + 05:30)
      const { user, cookie } = await createTestUser({ time_zone: 'Asia/Kolkata' });
      const subject = await createTestSubject(user.id);

      // In Asia/Kolkata:
      // 2026-10-16 23:50:00 IST to 2026-10-17 00:20:00 IST
      // 10 mins in Day 1 (600s), 20 mins in Day 2 (1200s)
      const startTime = DateTime.fromISO('2026-10-16T23:50:00', { zone: 'Asia/Kolkata' }).toJSDate();
      const endTime = DateTime.fromISO('2026-10-17T00:20:00', { zone: 'Asia/Kolkata' }).toJSDate();

      // Test split algorithm directly
      const segments = splitSessionAcrossDays(startTime, endTime, 1800, 'Asia/Kolkata');
      expect(segments.length).toBe(2);
      expect(segments[0].day).toBe('2026-10-16');
      expect(segments[0].studySeconds).toBe(600);
      expect(segments[1].day).toBe('2026-10-17');
      expect(segments[1].studySeconds).toBe(1200);

      // Test manual session submission crossing midnight
      const res = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: startTime.toISOString(),
          ended_at: endTime.toISOString(),
          note: 'Late night study',
        });

      expect(res.status).toBe(201);

      // Verify daily_totals has rows for both local calendar days
      const pool = getTestPool();
      const { rows: totals } = await pool.query(
        `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day, minutes FROM daily_totals WHERE user_id = $1 ORDER BY day ASC`,
        [user.id]
      );

      expect(totals.length).toBe(2);
      expect(totals[0].day).toBe('2026-10-16');
      expect(totals[0].minutes).toBe(10);
      expect(totals[1].day).toBe('2026-10-17');
      expect(totals[1].minutes).toBe(20);
    });
  });
});

