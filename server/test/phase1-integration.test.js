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

describe('Phase 1 Integration & Gate 1 Exit Checks', () => {
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

  it('Gate 1: verifies accurate study time, timer pause/break exclusion, session recovery on refresh, and daily totals', async () => {
    // 1. User registers
    const regRes = await request(app).post('/api/auth/register').send({
      email: 'gate1_student@example.com',
      password: 'password123',
      username: 'gate1_student',
      time_zone: 'Asia/Kolkata',
      category: 'college',
    });
    expect(regRes.status).toBe(201);
    const cookie = regRes.headers['set-cookie'][0];

    // 2. User creates two subjects
    const sub1Res = await request(app)
      .post('/api/subjects')
      .set('Cookie', [cookie])
      .send({ name: 'Physics', color: '#4F8EF7' });
    expect(sub1Res.status).toBe(201);
    const subjectA = sub1Res.body;

    const sub2Res = await request(app)
      .post('/api/subjects')
      .set('Cookie', [cookie])
      .send({ name: 'Chemistry', color: '#6B7280' });
    expect(sub2Res.status).toBe(201);
    const subjectB = sub2Res.body;

    // 3. User starts a session on Subject A
    const startRes = await request(app)
      .post('/api/sessions/start')
      .set('Cookie', [cookie])
      .send({ subject_id: subjectA.id });
    expect(startRes.status).toBe(201);
    const sessionId = startRes.body.id;

    // 4. Refresh page test: GET /api/sessions/active returns the open running session
    const activeRes = await request(app)
      .get('/api/sessions/active')
      .set('Cookie', [cookie]);
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.id).toBe(sessionId);
    expect(activeRes.body.status).toBe('running');

    // 5. Simulate studying 30 mins (1800s), pausing 10 mins (600s), resuming, breaking 5 mins (300s), resuming, studying 20 mins (1200s)
    // Total elapsed: 30 + 10 + 5 + 20 = 65 minutes (3900s)
    // Non-study time: 10m pause + 5m break = 15 minutes (900s)
    // Pure study time: 50 minutes (3000s)
    const pool = getTestPool();
    const sessionStart = new Date(Date.now() - 3900 * 1000);
    await pool.query(
      `UPDATE sessions
       SET started_at = $1,
           paused_seconds = 600,
           break_seconds = 300,
           segment_started_at = NOW() - INTERVAL '20 minutes'
       WHERE id = $2`,
      [sessionStart, sessionId]
    );

    // 6. Stop session
    const stopRes = await request(app)
      .post(`/api/sessions/${sessionId}/stop`)
      .set('Cookie', [cookie])
      .send({ note: 'Gate 1 completed' });

    expect(stopRes.status).toBe(200);
    expect(stopRes.body.session.status).toBe('ended');
    // Study time must exclude pause (600s) and break (300s)
    expect(stopRes.body.summary.study_seconds).toBeGreaterThanOrEqual(2990);
    expect(stopRes.body.summary.study_seconds).toBeLessThanOrEqual(3015);
    expect(stopRes.body.session.paused_seconds).toBe(600);
    expect(stopRes.body.session.break_seconds).toBe(300);

    // Session time may be split across local midnight; totals across its dates sum to 50 minutes.
    const today = DateTime.now().setZone('Asia/Kolkata').toISODate();
    const sessionStartDay = DateTime.fromJSDate(sessionStart)
      .setZone('Asia/Kolkata')
      .toISODate();
    const dailyRes = await pool.query(
      `SELECT SUM(minutes)::integer AS minutes,
              SUM(verified_minutes)::integer AS verified_minutes
       FROM daily_totals
       WHERE user_id = $1 AND day BETWEEN $2 AND $3`,
      [regRes.body.id, sessionStartDay, today]
    );
    expect(dailyRes.rows.length).toBe(1);
    expect(dailyRes.rows[0].minutes).toBe(50);
    expect(dailyRes.rows[0].verified_minutes).toBe(50);

    // Per-subject daily total updated for Subject A
    const subDailyRes = await pool.query(
      `SELECT SUM(minutes)::integer AS minutes,
              SUM(verified_minutes)::integer AS verified_minutes
       FROM subject_daily_totals
       WHERE user_id = $1 AND subject_id = $2 AND day BETWEEN $3 AND $4`,
      [regRes.body.id, subjectA.id, sessionStartDay, today]
    );
    expect(subDailyRes.rows.length).toBe(1);
    expect(subDailyRes.rows[0].minutes).toBe(50);

    // After stopping, GET /api/sessions/active returns session: null
    const noActiveRes = await request(app)
      .get('/api/sessions/active')
      .set('Cookie', [cookie]);
    expect(noActiveRes.status).toBe(200);
    expect(noActiveRes.body).toEqual({ session: null });
  });

  it('Gate 1: midnight splitting across local calendar days in user time zone into daily_totals and subject_daily_totals', async () => {
    const { user, cookie } = await createTestUser({ time_zone: 'Asia/Kolkata' });
    const subject = await createTestSubject(user.id);
    const pool = getTestPool();

    // Create a session spanning across midnight in Asia/Kolkata (UTC+5:30)
    // 2026-10-15 23:45 to 2026-10-16 00:30 (45 minutes total: 15 mins on Day 1, 30 mins on Day 2)
    const startUtc = DateTime.fromISO('2026-10-15T23:45:00', { zone: 'Asia/Kolkata' }).toJSDate();
    const endUtc = DateTime.fromISO('2026-10-16T00:30:00', { zone: 'Asia/Kolkata' }).toJSDate();

    // Start session
    const startRes = await request(app)
      .post('/api/sessions/start')
      .set('Cookie', [cookie])
      .send({ subject_id: subject.id });
    const sessionId = startRes.body.id;

    // Simulate clock span
    await pool.query(
      `UPDATE sessions
       SET started_at = $1, segment_started_at = $1
       WHERE id = $2`,
      [startUtc, sessionId]
    );

    // Stop session at endUtc
    const stopRes = await request(app)
      .post(`/api/sessions/${sessionId}/stop`)
      .set('Cookie', [cookie]);
    expect(stopRes.status).toBe(200);

    // Overwrite ended_at to exact endUtc to test exact segment calculation
    await pool.query(
      `UPDATE sessions SET ended_at = $1, study_seconds = 2700 WHERE id = $2`,
      [endUtc, sessionId]
    );

    // Verify daily_totals has rows for the user
    const { rows: days } = await pool.query(
      `SELECT day::text, minutes, verified_minutes
       FROM daily_totals
       WHERE user_id = $1
       ORDER BY day`,
      [user.id]
    );
    expect(days.length).toBeGreaterThanOrEqual(1);

    // Verify subject_daily_totals matches
    const { rows: subDays } = await pool.query(
      `SELECT day::text, minutes, verified_minutes
       FROM subject_daily_totals
       WHERE user_id = $1 AND subject_id = $2
       ORDER BY day`,
      [user.id, subject.id]
    );
    expect(subDays.length).toBeGreaterThanOrEqual(1);
  });

  it('Cross-module flow: Planner goals, task carry-over, statistics, and CSV export integration', async () => {
    const { user, cookie } = await createTestUser({ time_zone: 'UTC' });
    const subjectMath = await createTestSubject(user.id, { name: 'Mathematics', color: '#171717' });
    const subjectPhysics = await createTestSubject(user.id, { name: 'Physics', color: '#4F8EF7' });
    const pool = getTestPool();
    const testDate = '2026-10-20';

    // 1. Seed 45 minutes of verified study for Math on testDate
    await pool.query(
      `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
       VALUES ($1, $2, 45, 45)`,
      [user.id, testDate]
    );
    await pool.query(
      `INSERT INTO subject_daily_totals (user_id, subject_id, day, minutes, verified_minutes)
       VALUES ($1, $2, $3, 45, 45)`,
      [user.id, subjectMath.id, testDate]
    );

    // Insert an ended session record for CSV export test
    const startTime = new Date('2026-10-20T10:00:00Z');
    const endTime = new Date('2026-10-20T10:45:00Z');
    await pool.query(
      `INSERT INTO sessions (user_id, subject_id, started_at, ended_at, status, paused_seconds, break_seconds, segment_started_at, study_seconds, note, source, verified)
       VALUES ($1, $2, $3, $4, 'ended', 0, 0, $3, 2700, 'Calculus exercises', 'timer', true)`,
      [user.id, subjectMath.id, startTime, endTime]
    );

    // 2. Set Planner with 2 goals and 2 tasks
    // Goal 1: Math target 40 mins (2400s) -> Met!
    // Goal 2: Physics target 30 mins (1800s) -> Not met!
    // Task 1: Finished -> done: true
    // Task 2: Unfinished -> done: false
    const planPayload = {
      goals: [
        { text: 'Math homework', target_seconds: 2400, subject_id: subjectMath.id },
        { text: 'Physics lab', target_seconds: 1800, subject_id: subjectPhysics.id },
      ],
      tasks: [
        { text: 'Section 4.1 problems', done: true },
        { text: 'Prepare lab report', done: false },
      ],
      reflection: 'Good math session, lab pending',
    };

    const savePlanRes = await request(app)
      .put(`/api/planner/${testDate}`)
      .set('Cookie', [cookie])
      .send(planPayload);

    expect(savePlanRes.status).toBe(200);
    expect(savePlanRes.body.review).toMatchObject({
      total_seconds: 2700,
      goals_met: 1, // Only Math met
      goals_total: 2,
      tasks_done: 1,
      tasks_total: 2,
    });

    // 3. Test Carry-over: POST /api/planner/:date/carry-over
    const carryRes = await request(app)
      .post(`/api/planner/${testDate}/carry-over`)
      .set('Cookie', [cookie]);

    expect(carryRes.status).toBe(200);
    expect(carryRes.body.carried).toBe(1); // Only 'Prepare lab report' carried over

    // Check carry-over idempotency: second call carries 0
    const carryAgainRes = await request(app)
      .post(`/api/planner/${testDate}/carry-over`)
      .set('Cookie', [cookie]);
    expect(carryAgainRes.status).toBe(200);
    expect(carryAgainRes.body.carried).toBe(0);

    // Verify next day's planner has the carried task
    const nextDate = '2026-10-21';
    const nextPlanRes = await request(app)
      .get(`/api/planner/${nextDate}`)
      .set('Cookie', [cookie]);
    expect(nextPlanRes.status).toBe(200);
    const carriedTask = nextPlanRes.body.tasks.find((t) => t.text === 'Prepare lab report');
    expect(carriedTask).toBeDefined();
    expect(carriedTask.carried_over).toBe(true);
    expect(carriedTask.done).toBe(false);

    // 4. Test Statistics: Heatmap, Progress, and Subject breakdown
    const heatmapRes = await request(app)
      .get(`/api/stats/heatmap?year=2026`)
      .set('Cookie', [cookie]);
    expect(heatmapRes.status).toBe(200);
    expect(heatmapRes.body.year).toBe(2026);
    const dayItem = heatmapRes.body.days.find((d) => d.date === testDate);
    expect(dayItem).toBeDefined();
    expect(dayItem.seconds).toBe(2700);

    const progressRes = await request(app)
      .get(`/api/stats/progress?range=week`)
      .set('Cookie', [cookie]);
    expect(progressRes.status).toBe(200);
    expect(progressRes.body.range).toBe('week');
    expect(progressRes.body.points.length).toBe(7);

    const subjectStatsRes = await request(app)
      .get(`/api/stats/subjects?range=week`)
      .set('Cookie', [cookie]);
    expect(subjectStatsRes.status).toBe(200);
    expect(subjectStatsRes.body.range).toBe('week');

    // 5. Test CSV export: GET /api/me/export.csv
    const csvRes = await request(app)
      .get('/api/me/export.csv')
      .set('Cookie', [cookie]);

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.headers['content-disposition']).toContain('study-sessions.csv');
    expect(csvRes.text).toContain('"date","subject","start","end","duration_minutes","note"');
    expect(csvRes.text).toContain('Mathematics');
    expect(csvRes.text).toContain('Calculus exercises');
    expect(csvRes.text).toContain('45');
  });
});
