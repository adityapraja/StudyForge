import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, cleanDb, createTestUser, createTestSubject, getTestPool } from './test-helper.js';

describe('Sessions & Timer Module', () => {
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

  describe('POST /api/sessions/start and GET /api/sessions/active', () => {
    it('starts a timer session stamped by server clock and recovers active session', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      // Start session
      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });

      expect(startRes.status).toBe(201);
      expect(startRes.body).toMatchObject({
        subject_id: subject.id,
        status: 'running',
        paused_seconds: 0,
        break_seconds: 0,
        study_seconds: null,
        source: 'timer',
        verified: true,
      });
      expect(startRes.body.started_at).toBeDefined();
      expect(startRes.body.segment_started_at).toBeDefined();

      const sessionId = startRes.body.id;

      // GET /api/sessions/active resumes the open session (recovery on page load)
      const activeRes = await request(app)
        .get('/api/sessions/active')
        .set('Cookie', [cookie]);

      expect(activeRes.status).toBe(200);
      expect(activeRes.body.id).toBe(sessionId);
      expect(activeRes.body.status).toBe('running');
    });

    it('rejects a second open session with 409 SESSION_ALREADY_OPEN and includes open_session', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const firstRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });

      const secondRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.error.code).toBe('SESSION_ALREADY_OPEN');
      expect(secondRes.body.error.open_session).toBeDefined();
      expect(secondRes.body.error.open_session.id).toBe(firstRes.body.id);
    });

    it('returns { session: null } when no active session exists', async () => {
      const { cookie } = await createTestUser();

      const res = await request(app)
        .get('/api/sessions/active')
        .set('Cookie', [cookie]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ session: null });
    });
  });

  describe('Timer state transitions (pause, break, resume)', () => {
    it('handles running -> paused -> running and calculates paused_seconds', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      // Pause
      const pauseRes = await request(app)
        .post(`/api/sessions/${sessionId}/pause`)
        .set('Cookie', [cookie]);

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.status).toBe('paused');

      // Manipulate segment_started_at in DB to simulate 10 minutes (600 seconds) of pause
      const pool = getTestPool();
      await pool.query(
        `UPDATE sessions SET segment_started_at = NOW() - INTERVAL '600 seconds' WHERE id = $1`,
        [sessionId]
      );

      // Resume
      const resumeRes = await request(app)
        .post(`/api/sessions/${sessionId}/resume`)
        .set('Cookie', [cookie]);

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.status).toBe('running');
      expect(resumeRes.body.paused_seconds).toBeGreaterThanOrEqual(600);
    });

    it('handles running -> on_break -> running and calculates break_seconds', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      // Break
      const breakRes = await request(app)
        .post(`/api/sessions/${sessionId}/break`)
        .set('Cookie', [cookie]);

      expect(breakRes.status).toBe(200);
      expect(breakRes.body.status).toBe('on_break');

      // Simulate 5 minutes (300 seconds) on break
      const pool = getTestPool();
      await pool.query(
        `UPDATE sessions SET segment_started_at = NOW() - INTERVAL '300 seconds' WHERE id = $1`,
        [sessionId]
      );

      // Resume
      const resumeRes = await request(app)
        .post(`/api/sessions/${sessionId}/resume`)
        .set('Cookie', [cookie]);

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.status).toBe('running');
      expect(resumeRes.body.break_seconds).toBeGreaterThanOrEqual(300);
    });

    it('rejects disallowed state transitions with 409 INVALID_STATE', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      // Cannot resume while already running
      const invalidResume = await request(app)
        .post(`/api/sessions/${sessionId}/resume`)
        .set('Cookie', [cookie]);
      expect(invalidResume.status).toBe(409);
      expect(invalidResume.body.error.code).toBe('INVALID_STATE');

      // Pause the session
      await request(app)
        .post(`/api/sessions/${sessionId}/pause`)
        .set('Cookie', [cookie]);

      // Cannot pause again while paused
      const invalidPause = await request(app)
        .post(`/api/sessions/${sessionId}/pause`)
        .set('Cookie', [cookie]);
      expect(invalidPause.status).toBe(409);
      expect(invalidPause.body.error.code).toBe('INVALID_STATE');

      // Cannot go to break directly from paused
      const invalidBreak = await request(app)
        .post(`/api/sessions/${sessionId}/break`)
        .set('Cookie', [cookie]);
      expect(invalidBreak.status).toBe(409);
      expect(invalidBreak.body.error.code).toBe('INVALID_STATE');
    });
  });

  describe('Stop Session & End-of-Session Flow', () => {
    it('stops session, deducts pause and break time, awards XP, and updates daily_totals in one transaction', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      // Simulate a 45-minute session started 45 minutes ago with 10 mins pause and 5 mins break
      // Total elapsed = 2700s (45m), paused = 600s (10m), break = 300s (5m) -> study_seconds = 1800s (30m)
      const pool = getTestPool();
      await pool.query(
        `UPDATE sessions
         SET started_at = NOW() - INTERVAL '2700 seconds',
             paused_seconds = 600,
             break_seconds = 300
         WHERE id = $1`,
        [sessionId]
      );

      const stopRes = await request(app)
        .post(`/api/sessions/${sessionId}/stop`)
        .set('Cookie', [cookie])
        .send({ note: 'Finished chapter 4' });

      expect(stopRes.status).toBe(200);
      expect(stopRes.body.session.status).toBe('ended');
      expect(stopRes.body.session.note).toBe('Finished chapter 4');

      // Check study_seconds: ~1800 seconds (30 minutes)
      const studySec = stopRes.body.summary.study_seconds;
      expect(studySec).toBeGreaterThanOrEqual(1790);
      expect(studySec).toBeLessThanOrEqual(1810);

      // Check XP: 1 XP per minute = 30 XP
      expect(stopRes.body.summary.xp_awarded).toBe(30);

      // Check daily_totals updated in database
      const { rows: dtRows } = await pool.query(
        'SELECT minutes, verified_minutes FROM daily_totals WHERE user_id = $1',
        [user.id]
      );
      expect(dtRows.length).toBe(1);
      expect(dtRows[0].minutes).toBe(30);
      expect(dtRows[0].verified_minutes).toBe(30);

      // Check user XP updated
      const { rows: userRows } = await pool.query('SELECT xp, level FROM users WHERE id = $1', [user.id]);
      expect(userRows[0].xp).toBe(30);

      // Check xp_events recorded
      const { rows: xpRows } = await pool.query(
        'SELECT kind, amount FROM xp_events WHERE session_id = $1',
        [sessionId]
      );
      expect(xpRows.length).toBe(1);
      expect(xpRows[0].kind).toBe('session');
      expect(xpRows[0].amount).toBe(30);
    });

    it('finalizes active pause stretch automatically if stopped during pause', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const startRes = await request(app)
        .post('/api/sessions/start')
        .set('Cookie', [cookie])
        .send({ subject_id: subject.id });
      const sessionId = startRes.body.id;

      // Pause session
      await request(app)
        .post(`/api/sessions/${sessionId}/pause`)
        .set('Cookie', [cookie]);

      // Simulate started 30 mins ago, paused 10 mins ago
      const pool = getTestPool();
      await pool.query(
        `UPDATE sessions
         SET started_at = NOW() - INTERVAL '1800 seconds',
             segment_started_at = NOW() - INTERVAL '600 seconds'
         WHERE id = $1`,
        [sessionId]
      );

      const stopRes = await request(app)
        .post(`/api/sessions/${sessionId}/stop`)
        .set('Cookie', [cookie]);

      expect(stopRes.status).toBe(200);
      // Paused stretch of 10m (600s) should have been added
      expect(stopRes.body.session.paused_seconds).toBeGreaterThanOrEqual(600);
      // Net study time ~20m (1200s)
      expect(stopRes.body.summary.study_seconds).toBeGreaterThanOrEqual(1190);
      expect(stopRes.body.summary.study_seconds).toBeLessThanOrEqual(1210);
    });
  });

  describe('Session Listing and Search', () => {
    it('lists past sessions with filtering and note search', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const pool = getTestPool();
      // Insert completed sessions
      await pool.query(
        `INSERT INTO sessions (user_id, subject_id, started_at, ended_at, status, study_seconds, note, source, verified, segment_started_at)
         VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 'ended', 3600, 'Thermodynamics chapter', 'timer', true, NOW()),
                ($1, $2, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hour', 'ended', 3600, 'Optics lab', 'timer', true, NOW())`,
        [user.id, subject.id]
      );

      // Search by q
      const res = await request(app)
        .get('/api/sessions?q=Thermodynamics')
        .set('Cookie', [cookie]);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].note).toBe('Thermodynamics chapter');
    });

    it('deletes own session', async () => {
      const { user, cookie } = await createTestUser();
      const subject = await createTestSubject(user.id);

      const pool = getTestPool();
      const { rows } = await pool.query(
        `INSERT INTO sessions (user_id, subject_id, started_at, ended_at, status, study_seconds, source, verified, segment_started_at)
         VALUES ($1, $2, NOW() - INTERVAL '1 hour', NOW(), 'ended', 3600, 'timer', true, NOW())
         RETURNING id`,
        [user.id, subject.id]
      );
      const sessionId = rows[0].id;

      const delRes = await request(app)
        .delete(`/api/sessions/${sessionId}`)
        .set('Cookie', [cookie]);

      expect(delRes.status).toBe(200);
      expect(delRes.body).toEqual({ ok: true });
    });
  });
});

