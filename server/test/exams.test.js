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

describe('Exams Module', () => {
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

  it('requires authentication, validates input, and checks subject ownership', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const subject = await createTestSubject(owner.user.id);

    expect((await request(app).get('/api/exams')).status).toBe(401);

    const invalidDate = await request(app)
      .post('/api/exams')
      .set('Cookie', [owner.cookie])
      .send({ subject_id: subject.id, date: '2026-02-30', target_hours: 10 });
    expect(invalidDate.status).toBe(400);

    const foreignSubject = await request(app)
      .post('/api/exams')
      .set('Cookie', [other.cookie])
      .send({ subject_id: subject.id, date: '2026-12-05' });
    expect(foreignSubject.status).toBe(404);
  });

  it('creates, updates, lists and deletes exams owned by the user', async () => {
    const { user, cookie } = await createTestUser({ time_zone: 'Pacific/Honolulu' });
    const subject = await createTestSubject(user.id);
    const today = DateTime.now().setZone(user.time_zone).toISODate();
    const tomorrow = DateTime.now().setZone(user.time_zone).plus({ days: 1 }).toISODate();

    const created = await request(app)
      .post('/api/exams')
      .set('Cookie', [cookie])
      .send({ subject_id: subject.id, date: today, target_hours: 2 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      subject_id: subject.id,
      date: today,
      target_hours: 2,
      days_left: 0,
      logged_hours: 0,
      hours_needed_per_day: 2,
    });

    const updated = await request(app)
      .patch(`/api/exams/${created.body.id}`)
      .set('Cookie', [cookie])
      .send({ date: tomorrow, target_hours: null });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      date: tomorrow,
      target_hours: null,
      days_left: 1,
      hours_needed_per_day: null,
    });

    const list = await request(app).get('/api/exams').set('Cookie', [cookie]);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);

    const deleted = await request(app)
      .delete(`/api/exams/${created.body.id}`)
      .set('Cookie', [cookie]);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ ok: true });
  });

  it('uses local exam dates, excludes past exams, and rounds remaining hours including exams today', async () => {
    const { user, cookie } = await createTestUser({ time_zone: 'Pacific/Kiritimati' });
    const subject = await createTestSubject(user.id);
    const today = DateTime.now().setZone(user.time_zone).toISODate();
    const yesterday = DateTime.now().setZone(user.time_zone).minus({ days: 1 }).toISODate();
    const pool = getTestPool();
    const oldSessionEnd = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oldSessionStart = new Date(oldSessionEnd.getTime() - 1800 * 1000);
    await pool.query(
      `INSERT INTO sessions (user_id, subject_id, started_at, ended_at, segment_started_at,
                             status, study_seconds)
       VALUES ($1, $2, $3, $4, $3, 'ended', 3600)`,
      [user.id, subject.id, oldSessionStart, oldSessionEnd]
    );
    const { rows: todayExam } = await pool.query(
      `INSERT INTO exams (user_id, subject_id, date, target_hours)
       VALUES ($1, $2, $3, 3)
       RETURNING id`,
      [user.id, subject.id, today]
    );
    await pool.query(
      `INSERT INTO sessions (user_id, subject_id, started_at, ended_at, segment_started_at,
                             status, study_seconds)
       VALUES ($1, $2, NOW(), NOW(), NOW(), 'ended', 5400)`,
      [user.id, subject.id]
    );
    await pool.query(
      `INSERT INTO exams (user_id, subject_id, date, target_hours)
       VALUES ($1, $2, $3, 100)`,
      [user.id, subject.id, yesterday]
    );

    const exams = await request(app).get('/api/exams').set('Cookie', [cookie]);
    expect(exams.status).toBe(200);
    expect(exams.body).toHaveLength(1);
    expect(exams.body[0]).toMatchObject({
      id: todayExam[0].id,
      days_left: 0,
      logged_hours: 1.5,
      hours_needed_per_day: 1.5,
    });

    await pool.query(
      'UPDATE exams SET target_hours = 2.13 WHERE id = $1',
      [todayExam[0].id]
    );
    const met = await request(app).get('/api/exams').set('Cookie', [cookie]);
    expect(met.body[0].hours_needed_per_day).toBe(0.6);
    await pool.query(
      'UPDATE exams SET target_hours = 1 WHERE id = $1',
      [todayExam[0].id]
    );
    const targetMet = await request(app).get('/api/exams').set('Cookie', [cookie]);
    expect(targetMet.body[0].hours_needed_per_day).toBeNull();
  });

  it('returns 404 for another user’s exam and validates empty updates', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const subject = await createTestSubject(owner.user.id);
    const { rows } = await getTestPool().query(
      `INSERT INTO exams (user_id, subject_id, date)
       VALUES ($1, $2, '2099-01-01')
       RETURNING id`,
      [owner.user.id, subject.id]
    );

    const foreign = await request(app)
      .patch(`/api/exams/${rows[0].id}`)
      .set('Cookie', [other.cookie])
      .send({ date: '2099-02-01' });
    expect(foreign.status).toBe(404);

    const empty = await request(app)
      .patch(`/api/exams/${rows[0].id}`)
      .set('Cookie', [owner.cookie])
      .send({});
    expect(empty.status).toBe(400);
  });
});
