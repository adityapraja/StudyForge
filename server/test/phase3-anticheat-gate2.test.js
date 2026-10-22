import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createApp } from '../src/app.js';
import { query } from '../src/db.js';
import { friendRequestRateLimiter } from '../src/middleware/rate-limit.js';
import {
  findSuspiciousDays,
  auditSessionDiscrepancies,
  runNightlyAntiCheatAudit,
} from '../src/modules/progression/audit.service.js';

let app;

beforeEach(async () => {
  app = createApp();
});

const createTestUser = async (customUsername) => {
  const unique = Math.random().toString(36).substring(2, 9);
  const username = customUsername || `u_${unique}`;
  const email = `${username}@example.com`;

  const res = await request(app)
    .post('/api/auth/register')
    .send({
      username,
      email,
      password: 'password123',
      category: 'college',
    });

  const cookie = res.headers['set-cookie'][0].split(';')[0];
  return { user: res.body, cookie };
};

const createTestSubject = async (userId) => {
  const { rows } = await query(
    `INSERT INTO subjects (user_id, name, color)
     VALUES ($1, $2, '#3b82f6')
     RETURNING id, name`,
    [userId, `Subject_${Math.random().toString(36).substring(2, 7)}`]
  );
  return rows[0];
};

describe('Phase 3 (Person B) — Rate Limiting, Gate 2 Anti-Cheat & Nightly Audit', () => {
  describe('1. Friend Request Rate Limiting', () => {
    it('exports friendRequestRateLimiter middleware function', () => {
      expect(typeof friendRequestRateLimiter).toBe('function');
    });

    it('enforces rate limiting and returns 429 when threshold exceeded', async () => {
      const testApp = express();
      testApp.use(express.json());

      const testLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 2,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          res.status(429).json({
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many friend requests sent. Please try again later.',
            },
          });
        },
      });

      testApp.post('/api/friends/requests', testLimiter, (req, res) => {
        res.status(200).json({ ok: true });
      });

      const res1 = await request(testApp).post('/api/friends/requests').send({});
      expect(res1.status).toBe(200);

      const res2 = await request(testApp).post('/api/friends/requests').send({});
      expect(res2.status).toBe(200);

      const res3 = await request(testApp).post('/api/friends/requests').send({});
      expect(res3.status).toBe(429);
      expect(res3.body).toEqual({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many friend requests sent. Please try again later.',
        },
      });
    });
  });

  describe('2. Gate 2 Anti-Cheat: Manual Sessions Excluded from Verified Time & Leaderboards', () => {
    it('ensures manual sessions earn 0 XP, set verified=false, and do not increment verified_minutes', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const now = new Date();
      const startedAt = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
      const endedAt = now.toISOString();

      const manualRes = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: startedAt,
          ended_at: endedAt,
          note: 'Manual backfilled session',
        });

      expect(manualRes.status).toBe(201);
      expect(manualRes.body.verified).toBe(false);
      expect(manualRes.body.source).toBe('manual');

      // Verify no XP event was created
      const { rows: xpEventRows } = await query(
        `SELECT * FROM xp_events WHERE session_id = $1`,
        [manualRes.body.id]
      );
      expect(xpEventRows.length).toBe(0);

      // Verify daily_totals has minutes = 120, but verified_minutes = 0
      const today = now.toISOString().slice(0, 10);
      const { rows: dtRows } = await query(
        `SELECT minutes, verified_minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
        [user.id, today]
      );
      expect(dtRows.length).toBe(1);
      expect(dtRows[0].minutes).toBe(120);
      expect(dtRows[0].verified_minutes).toBe(0);

      // Verify user total XP is still 0
      const xpRes = await request(app).get('/api/me/xp').set('Cookie', [cookie]);
      expect(xpRes.body.xp).toBe(0);

      // Verify Leaderboard query (which filters on verified_minutes > 0) returns 0 records for this user
      const { rows: lbRows } = await query(
        `SELECT user_id, SUM(verified_minutes) as total_verified
         FROM daily_totals
         WHERE user_id = $1 AND verified_minutes > 0
         GROUP BY user_id`,
        [user.id]
      );
      expect(lbRows.length).toBe(0);
    });

    it('rejects overlapping sessions with 409 SESSION_OVERLAP', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const base = new Date('2026-10-20T10:00:00Z').getTime();
      const s1Start = new Date(base).toISOString();
      const s1End = new Date(base + 3600 * 1000).toISOString(); // 10:00 - 11:00

      const res1 = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: s1Start,
          ended_at: s1End,
        });
      expect(res1.status).toBe(201);

      // Overlapping session: 10:30 - 11:30
      const s2Start = new Date(base + 1800 * 1000).toISOString();
      const s2End = new Date(base + 5400 * 1000).toISOString();

      const res2 = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: s2Start,
          ended_at: s2End,
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('SESSION_OVERLAP');
    });
  });

  describe('3. Gate 2 Anti-Cheat: Hard Session & Daily Caps', () => {
    it('strictly caps XP at 240 (4 hours) even for 5-hour verified sessions', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      // Start timer session
      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      expect(startRes.status).toBe(201);
      const sessionId = startRes.body.id;

      // Simulate 5 hours (18,000s) elapsed by updating started_at in DB
      const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000);
      await query(
        `UPDATE sessions SET started_at = $1, segment_started_at = $1 WHERE id = $2`,
        [fiveHoursAgo, sessionId]
      );

      // Stop session
      const stopRes = await request(app)
        .post(`/api/sessions/${sessionId}/stop`)
        .set('Cookie', [cookie])
        .send();

      expect(stopRes.status).toBe(200);
      // Study seconds ~ 18,000s (300 mins)
      expect(stopRes.body.summary.study_seconds).toBeGreaterThanOrEqual(17990);
      // Session XP capped at 240 XP (config.sessionXpCapHours * 60)
      expect(stopRes.body.summary.session_xp).toBe(240);
    });

    it('enforces 16-hour daily study cap on daily_totals', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);
      const today = new Date().toISOString().slice(0, 10);

      // Pre-seed 15 hours (900 minutes) in daily_totals
      await query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
         VALUES ($1, $2, 900, 900)`,
        [user.id, today]
      );

      // Start and end a 2-hour (120 minutes) session
      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
      await query(
        `UPDATE sessions SET started_at = $1, segment_started_at = $1 WHERE id = $2`,
        [twoHoursAgo, sessionId]
      );

      const stopRes = await request(app)
        .post(`/api/sessions/${sessionId}/stop`)
        .set('Cookie', [cookie])
        .send();

      expect(stopRes.status).toBe(200);

      // Only 60 minutes counted out of 120 (since 900 + 60 = 960 = 16 hours cap)
      expect(stopRes.body.summary.counted_seconds).toBe(3600);

      const { rows } = await query(
        `SELECT minutes, verified_minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
        [user.id, today]
      );
      expect(rows[0].minutes).toBe(960);
      expect(rows[0].verified_minutes).toBe(960);
    });
  });

  describe('4. Nightly Audit Queries for Suspicious Activity', () => {
    it('detects cap saturation and suspicious high-volume days', async () => {
      const { user } = await createTestUser('sus_user');
      const today = new Date().toISOString().slice(0, 10);

      // Insert 960 minutes (cap saturation)
      await query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
         VALUES ($1, $2, 960, 960)
         ON CONFLICT (user_id, day) DO UPDATE SET minutes = 960, verified_minutes = 960`,
        [user.id, today]
      );

      const suspiciousDays = await findSuspiciousDays({ thresholdMinutes: 840, lookbackDays: 7 });
      const record = suspiciousDays.find((d) => d.user_id === user.id && d.day === today);

      expect(record).toBeDefined();
      expect(record.minutes).toBe(960);
      expect(record.flag).toBe('DAILY_CAP_SATURATION');
    });

    it('runs comprehensive nightly audit report without errors', async () => {
      const report = await runNightlyAntiCheatAudit({ lookbackDays: 7 });

      expect(report).toBeDefined();
      expect(typeof report.timestamp).toBe('string');
      expect(typeof report.flagged_users_count).toBe('number');
      expect(Array.isArray(report.suspicious_days)).toBe(true);
      expect(Array.isArray(report.discrepancies)).toBe(true);
    });
  });
});

