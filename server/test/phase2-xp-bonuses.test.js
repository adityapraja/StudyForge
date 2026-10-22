import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app.js';
import {
  setupTestDb,
  teardownTestDb,
  cleanDb,
  createTestUser,
  createTestSubject,
  getTestPool,
} from './test-helper.js';
import {
  awardTopicCompletionXp,
  awardDailyGoalXp,
  getXpBreakdown,
} from '../src/modules/progression/xp.service.js';

describe('Phase 2 — XP Awards, Bonus Rules & Weekly Goals', () => {
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

  describe('XP Curve & Level Progression', () => {
    it('calculates levels following 200 + (L-1)*50 curve correctly', () => {
      // Level 1: 0 to 199 XP
      expect(getXpBreakdown(0)).toMatchObject({ level: 1, xp_in_level: 0, xp_for_next_level: 200 });
      expect(getXpBreakdown(199)).toMatchObject({ level: 1, xp_in_level: 199, xp_for_next_level: 200 });

      // Level 2: 200 to 449 XP (needs 250 XP for next level)
      expect(getXpBreakdown(200)).toMatchObject({ level: 2, xp_in_level: 0, xp_for_next_level: 250 });
      expect(getXpBreakdown(449)).toMatchObject({ level: 2, xp_in_level: 249, xp_for_next_level: 250 });

      // Level 5 at 1240 XP: 200 + 250 + 300 + 350 = 1100. Remainder = 140, next needs 400.
      expect(getXpBreakdown(1240)).toMatchObject({
        level: 5,
        xp_in_level: 140,
        xp_for_next_level: 400,
      });
    });
  });

  describe('Bonus XP: Daily Goal Met (50 XP)', () => {
    it('awards 50 bonus XP when daily study goal is met by a verified session', async () => {
      // Set daily target to 30 minutes (1800s)
      const { user, cookie } = await createTestUser({
        daily_target_seconds: 1800,
        time_zone: 'UTC',
      });
      const subject = await createTestSubject(user.id);
      const pool = getTestPool();

      // Start a session
      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      // Simulate a 35-minute study session (2100s)
      await pool.query(
        `UPDATE sessions SET started_at = NOW() - INTERVAL '35 minutes' WHERE id = $1`,
        [sessionId]
      );

      // Stop session
      const stopRes = await request(app)
        .post(`/api/sessions/${sessionId}/stop`)
        .set('Cookie', [cookie]);

      expect(stopRes.status).toBe(200);
      expect(stopRes.body.summary.session_xp).toBe(35);
      expect(stopRes.body.summary.bonus_xp).toBe(50);
      expect(stopRes.body.summary.daily_goal_met).toBe(true);
      expect(stopRes.body.summary.xp_awarded).toBe(85); // 35 + 50

      // User's XP should be 85
      const { rows } = await pool.query('SELECT xp, level FROM users WHERE id = $1', [user.id]);
      expect(rows[0].xp).toBe(85);

      // Verify xp_events has 2 rows: session and daily_goal
      const { rows: events } = await pool.query(
        'SELECT kind, amount FROM xp_events WHERE user_id = $1 ORDER BY kind',
        [user.id]
      );
      expect(events.length).toBe(2);
      expect(events.map((e) => e.kind)).toEqual(['daily_goal', 'session']);
    });

    it('does not award daily goal bonus twice on the same day', async () => {
      const { user, cookie } = await createTestUser({
        daily_target_seconds: 1200, // 20 minutes
        time_zone: 'UTC',
      });
      const subject = await createTestSubject(user.id);
      const pool = getTestPool();

      // Session 1: 25 minutes -> meets daily goal -> awards 25 + 50 = 75 XP
      const start1 = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      await pool.query(
        `UPDATE sessions SET started_at = NOW() - INTERVAL '25 minutes' WHERE id = $1`,
        [start1.body.id]
      );
      const stop1 = await request(app)
        .post(`/api/sessions/${start1.body.id}/stop`)
        .set('Cookie', [cookie]);
      expect(stop1.body.summary.bonus_xp).toBe(50);
      expect(stop1.body.summary.xp_awarded).toBe(75);

      // Session 2 on same day: 15 minutes -> daily goal already met -> bonus_xp is 0
      const start2 = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      await pool.query(
        `UPDATE sessions SET started_at = NOW() - INTERVAL '15 minutes' WHERE id = $1`,
        [start2.body.id]
      );
      const stop2 = await request(app)
        .post(`/api/sessions/${start2.body.id}/stop`)
        .set('Cookie', [cookie]);

      expect(stop2.body.summary.session_xp).toBe(15);
      expect(stop2.body.summary.bonus_xp).toBe(0);
      expect(stop2.body.summary.daily_goal_met).toBe(false);
      expect(stop2.body.summary.xp_awarded).toBe(15);

      // Total user XP is 75 + 15 = 90
      const { rows } = await pool.query('SELECT xp FROM users WHERE id = $1', [user.id]);
      expect(rows[0].xp).toBe(90);
    });

    it('does not award daily goal bonus for manual unverified sessions', async () => {
      const { user, cookie } = await createTestUser({
        daily_target_seconds: 1800,
        time_zone: 'UTC',
      });
      const subject = await createTestSubject(user.id);
      const pool = getTestPool();

      // Add a 60-minute manual session
      const manualRes = await request(app)
        .post('/api/sessions/manual')
        .set('Cookie', [cookie])
        .send({
          subject_id: subject.id,
          started_at: '2026-10-20T10:00:00Z',
          ended_at: '2026-10-20T11:00:00Z',
        });
      expect(manualRes.status).toBe(201);
      expect(manualRes.body.verified).toBe(false);

      // Total user XP must remain 0
      const { rows } = await pool.query('SELECT xp FROM users WHERE id = $1', [user.id]);
      expect(rows[0].xp).toBe(0);
    });
  });

  describe('Bonus XP: Syllabus Topic Completion Hook (20 XP)', () => {
    it('awards 20 XP on topic completion and triggers level up when crossing threshold', async () => {
      // Start user with 190 XP (Level 1)
      const { user } = await createTestUser();
      const pool = getTestPool();
      await pool.query('UPDATE users SET xp = 190, level = 1 WHERE id = $1', [user.id]);

      const topicId = 'topic-geo-101';
      const client = await pool.connect();
      try {
        const result = await awardTopicCompletionXp(client, user.id, topicId);
        expect(result).toMatchObject({
          awarded: true,
          xp: 20,
          new_xp: 210,
          new_level: 2,
          level_up: true,
        });

        // Verify database reflects new XP and Level
        const { rows } = await client.query('SELECT xp, level FROM users WHERE id = $1', [user.id]);
        expect(rows[0].xp).toBe(210);
        expect(rows[0].level).toBe(2);
      } finally {
        client.release();
      }
    });

    it('prevents double awards when topic is toggled or retried (idempotent)', async () => {
      const { user } = await createTestUser();
      const pool = getTestPool();
      const topicId = 'topic-calculus-202';
      const client = await pool.connect();

      try {
        // First completion: awarded 20 XP
        const res1 = await awardTopicCompletionXp(client, user.id, topicId);
        expect(res1.awarded).toBe(true);
        expect(res1.xp).toBe(20);

        // Second completion for the same topic: rejected with ALREADY_AWARDED
        const res2 = await awardTopicCompletionXp(client, user.id, topicId);
        expect(res2.awarded).toBe(false);
        expect(res2.xp).toBe(0);
        expect(res2.reason).toBe('ALREADY_AWARDED');

        // User XP remains 20 (not 40)
        const { rows } = await client.query('SELECT xp FROM users WHERE id = $1', [user.id]);
        expect(rows[0].xp).toBe(20);
      } finally {
        client.release();
      }
    });
  });

  describe('Weekly Goals Endpoints & Progression Queries', () => {
    it('GET /api/me/goals returns 7-day Monday-to-Sunday breakdown and weekly progress metrics', async () => {
      const { user, cookie } = await createTestUser({
        daily_target_seconds: 3600, // 1 hour per day
        weekly_target_seconds: 14400, // 4 hours per week
        time_zone: 'UTC',
      });
      const pool = getTestPool();

      const now = DateTime.now().setZone('UTC');
      const startOfWeek = now.startOf('week'); // Monday
      const monDate = startOfWeek.toISODate();
      const tueDate = startOfWeek.plus({ days: 1 }).toISODate();

      // Seed 2 hours on Monday (goal met) and 30 mins on Tuesday (goal not met)
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
         VALUES ($1, $2, 120, 120), ($1, $3, 30, 30)`,
        [user.id, monDate, tueDate]
      );

      const res = await request(app)
        .get('/api/me/goals')
        .set('Cookie', [cookie]);

      expect(res.status).toBe(200);
      expect(res.body.daily_target_seconds).toBe(3600);
      expect(res.body.weekly_target_seconds).toBe(14400);
      expect(res.body.days.length).toBe(7);
      expect(res.body.days.map((d) => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

      const mon = res.body.days.find((d) => d.date === monDate);
      expect(mon.seconds).toBe(7200);
      expect(mon.goal_met).toBe(true);

      const tue = res.body.days.find((d) => d.date === tueDate);
      expect(tue.seconds).toBe(1800);
      expect(tue.goal_met).toBe(false);

      expect(res.body.days_goal_met).toBe(1);
      expect(res.body.week_seconds).toBe(9000); // 7200 + 1800
      expect(res.body.week_progress_percent).toBe(63); // 9000 / 14400 = 62.5% -> 63%
      expect(res.body.weekly_goal_met).toBe(false);

      // GET /api/me/goals/weekly returns the same breakdown
      const weeklyRes = await request(app)
        .get('/api/me/goals/weekly')
        .set('Cookie', [cookie]);
      expect(weeklyRes.status).toBe(200);
      expect(weeklyRes.body.days_goal_met).toBe(1);
    });

    it('PUT /api/me/goals supports partial and full updates', async () => {
      const { user, cookie } = await createTestUser();

      // Partial update: update only daily_target_seconds
      const res1 = await request(app)
        .put('/api/me/goals')
        .set('Cookie', [cookie])
        .send({ daily_target_seconds: 7200 });

      expect(res1.status).toBe(200);
      expect(res1.body.daily_target_seconds).toBe(7200);
      expect(res1.body.weekly_target_seconds).toBe(72000); // untouched default

      // Full update
      const res2 = await request(app)
        .put('/api/me/goals')
        .set('Cookie', [cookie])
        .send({
          daily_target_seconds: 10800,
          weekly_target_seconds: 54000,
          streak_minimum_minutes: 20,
        });

      expect(res2.status).toBe(200);
      expect(res2.body).toMatchObject({
        daily_target_seconds: 10800,
        weekly_target_seconds: 54000,
        streak_minimum_minutes: 20,
      });

      // Validation error: empty body rejected
      const resEmpty = await request(app)
        .put('/api/me/goals')
        .set('Cookie', [cookie])
        .send({});
      expect(resEmpty.status).toBe(400);
    });

    it('GET /api/me/xp/events returns XP event history with pagination', async () => {
      const { user, cookie } = await createTestUser();
      const pool = getTestPool();

      // Insert mock XP events
      await pool.query(
        `INSERT INTO xp_events (user_id, kind, amount, day, created_at)
         VALUES ($1, 'session', 60, CURRENT_DATE, NOW() - INTERVAL '2 hours'),
                ($1, 'daily_goal', 50, CURRENT_DATE, NOW() - INTERVAL '1 hour'),
                ($1, 'topic_done', 20, CURRENT_DATE, NOW())`,
        [user.id]
      );

      const res = await request(app)
        .get('/api/me/xp/events?limit=2')
        .set('Cookie', [cookie]);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(2);
      expect(res.body.items[0].kind).toBe('topic_done');
      expect(res.body.items[1].kind).toBe('daily_goal');
      expect(res.body.next_cursor).toBeDefined();

      // Follow pagination cursor
      const nextRes = await request(app)
        .get(`/api/me/xp/events?limit=2&cursor=${encodeURIComponent(res.body.next_cursor)}`)
        .set('Cookie', [cookie]);

      expect(nextRes.status).toBe(200);
      expect(nextRes.body.items.length).toBe(1);
      expect(nextRes.body.items[0].kind).toBe('session');
    });
  });
});
