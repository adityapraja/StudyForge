import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { withTransaction } from '../src/db.js';
import { setupTestDb, teardownTestDb, cleanDb, createTestUser, createTestSubject, getTestPool } from './test-helper.js';
import {
  executeSessionEndTransaction,
  splitSessionAcrossDays,
} from '../src/modules/sessions/session-end.transaction.js';

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

      const sessionEnd = DateTime.now()
        .setZone(user.time_zone)
        .minus({ days: 1 })
        .startOf('day')
        .plus({ hours: 12 });
      const sessionStart = sessionEnd.minus({ hours: 1 });

      const res = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: sessionStart.toISO(),
          ended_at: sessionEnd.toISO(),
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
        `SELECT COALESCE(SUM(minutes), 0)::integer AS minutes,
                COALESCE(SUM(verified_minutes), 0)::integer AS verified_minutes
         FROM daily_totals WHERE user_id = $1`,
        [user.id]
      );
      expect(dtRows[0].minutes).toBe(60);
      expect(dtRows[0].verified_minutes).toBe(0);
      const { rows: creditRows } = await pool.query(
        `SELECT leaderboard_credited_seconds, leaderboard_credited_at
         FROM sessions WHERE user_id = $1`,
        [user.id]
      );
      expect(creditRows).toEqual([{ leaderboard_credited_seconds: 0, leaderboard_credited_at: null }]);

      const leaderboard = await request(app)
        .get('/api/leaderboards?period=day')
        .set('Cookie', [cookie]);
      expect(leaderboard.status).toBe(200);
      expect(leaderboard.body.entries).toEqual([]);
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

    it('rejects manual time overlapping an open timer and creates no leaderboard credit', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);
      const started = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      expect(started.status).toBe(201);

      const pool = getTestPool();
      await pool.query(
        `UPDATE sessions SET started_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
        [started.body.id]
      );
      const overlap = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          ended_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        });
      expect(overlap.status).toBe(409);
      expect(overlap.body.error.code).toBe('SESSION_OVERLAP');

      const rows = await pool.query(
        `SELECT COUNT(*)::integer AS count
         FROM sessions
         WHERE user_id = $1 AND leaderboard_credited_seconds > 0`,
        [user.id]
      );
      expect(rows.rows[0].count).toBe(0);
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

    it('does not credit leaderboard time beyond the maximum session duration', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);
      const pool = getTestPool();
      const started = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      expect(started.status).toBe(201);

      await pool.query(
        `UPDATE sessions
         SET started_at = NOW() - (($2::integer + 2) * INTERVAL '1 hour')
         WHERE id = $1`,
        [started.body.id, config.maxSessionHours]
      );
      const stopped = await request(app)
        .post(`/api/sessions/${started.body.id}/stop`)
        .set('Cookie', [cookie]);
      expect(stopped.status).toBe(200);
      expect(stopped.body.summary.study_seconds).toBe(config.maxSessionHours * 3600);

      const { rows } = await pool.query(
        `SELECT leaderboard_credited_seconds
         FROM sessions WHERE id = $1`,
        [started.body.id]
      );
      expect(rows[0].leaderboard_credited_seconds).toBeGreaterThan(0);
      expect(rows[0].leaderboard_credited_seconds).toBeLessThanOrEqual(config.maxSessionHours * 3600);
    });

    it('rolls back finalization credits and accounting together, then credits only once on retry', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);
      const pool = getTestPool();
      const started = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      expect(started.status).toBe(201);
      await pool.query(
        `UPDATE sessions SET started_at = NOW() - INTERVAL '2 hours' WHERE id = $1`,
        [started.body.id]
      );

      await expect(withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT * FROM sessions
           WHERE id = $1 AND user_id = $2 AND ended_at IS NULL
           FOR UPDATE`,
          [started.body.id, user.id]
        );
        await executeSessionEndTransaction(client, user, rows[0]);
        throw new Error('simulate failure after session finalization');
      })).rejects.toThrow('simulate failure after session finalization');

      const { rows: rolledBackRows } = await pool.query(
        `SELECT ended_at, leaderboard_credited_seconds, leaderboard_credited_at
         FROM sessions WHERE id = $1`,
        [started.body.id]
      );
      expect(rolledBackRows[0]).toMatchObject({
        ended_at: null,
        leaderboard_credited_seconds: 0,
        leaderboard_credited_at: null,
      });
      const { rows: totalsAfterRollback } = await pool.query(
        'SELECT COUNT(*)::integer AS count FROM daily_totals WHERE user_id = $1',
        [user.id]
      );
      expect(totalsAfterRollback[0].count).toBe(0);
      const { rows: xpAfterRollback } = await pool.query(
        'SELECT xp FROM users WHERE id = $1',
        [user.id]
      );
      expect(xpAfterRollback[0].xp).toBe(0);

      const finalized = await request(app)
        .post(`/api/sessions/${started.body.id}/stop`)
        .set('Cookie', [cookie]);
      expect(finalized.status).toBe(200);
      const repeated = await request(app)
        .post(`/api/sessions/${started.body.id}/stop`)
        .set('Cookie', [cookie]);
      expect(repeated.status).toBe(404);

      const { rows: finalRows } = await pool.query(
        `SELECT leaderboard_credited_seconds, leaderboard_credited_at
         FROM sessions WHERE id = $1`,
        [started.body.id]
      );
      expect(finalRows[0].leaderboard_credited_seconds).toBeGreaterThan(0);
      expect(finalRows[0].leaderboard_credited_at).toBeInstanceOf(Date);
      const { rows: xpEvents } = await pool.query(
        `SELECT COUNT(*)::integer AS count
         FROM xp_events WHERE user_id = $1 AND session_id = $2 AND kind = 'session'`,
        [user.id, started.body.id]
      );
      expect(xpEvents[0].count).toBe(1);
    });

    it('enforces 16-hour daily cap on counted study time in daily_totals', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const pool = getTestPool();
      const sessionEnd = DateTime.now()
        .setZone(user.time_zone)
        .minus({ days: 1 })
        .startOf('day')
        .plus({ hours: 12 });
      const sessionStart = sessionEnd.minus({ hours: 2 });
      const sessionDay = sessionEnd.toISODate();

      // Seed 15 hours (900 minutes) before this same-day session.
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
         VALUES ($1, $2, 900, 900)`,
        [user.id, sessionDay]
      );

      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      // Finalize a deterministic two-hour session within one local day.
      await pool.query(
        `UPDATE sessions
         SET started_at = $2, segment_started_at = $2
         WHERE id = $1`,
        [sessionId, sessionStart.toJSDate()]
      );

      const result = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT * FROM sessions
           WHERE id = $1 AND user_id = $2 AND ended_at IS NULL
           FOR UPDATE`,
          [sessionId, user.id]
        );
        return executeSessionEndTransaction(client, user, rows[0], {
          endedAt: sessionEnd.toJSDate(),
        });
      });

      expect(result.summary.study_seconds).toBe(7200);
      // Study seconds = 7200 (2h)
      // But only 1 hour (3600 seconds = 60 minutes) could be counted before reaching the 16h cap!
      expect(result.summary.counted_seconds).toBe(3600);

      // daily_totals should be capped at 960 minutes (16 hours)
      const { rows } = await pool.query(
        `SELECT minutes, verified_minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
        [user.id, sessionDay]
      );
      expect(rows[0].minutes).toBe(960);
      expect(rows[0].verified_minutes).toBe(960);

      const { rows: creditRows } = await pool.query(
        `SELECT leaderboard_credited_seconds, leaderboard_credited_at
         FROM sessions WHERE id = $1`,
        [sessionId]
      );
      expect(creditRows[0].leaderboard_credited_seconds).toBe(3600);
      expect(creditRows[0].leaderboard_credited_at).toBeInstanceOf(Date);

      const leaderboard = await request(app)
        .get('/api/leaderboards?period=day')
        .set('Cookie', [cookie]);
      expect(leaderboard.body.entries).toEqual([
        expect.objectContaining({ user_id: user.id, seconds: 3600 }),
      ]);
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
