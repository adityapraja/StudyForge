import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, cleanDb, createTestUser, createTestSubject } from './test-helper.js';

describe('Planner module', () => {
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

  it('creates, retrieves, and replaces a daily plan', async () => {
    const { user, cookie } = await createTestUser();
    const subject = await createTestSubject(user.id);
    const path = '/api/planner/2026-10-21';
    const payload = {
      goals: [{ text: 'Physics', target_seconds: 3600, subject_id: subject.id }],
      tasks: [{ text: 'Read chapter 1', done: false }],
      reflection: 'Stay focused',
    };

    const save = await request(app).put(path).set('Cookie', [cookie]).send(payload);
    expect(save.status).toBe(200);
    expect(save.body).toMatchObject({
      date: '2026-10-21',
      reflection: 'Stay focused',
      goals: [{ text: 'Physics', target_seconds: 3600, subject_id: subject.id }],
      tasks: [{ text: 'Read chapter 1', done: false, carried_over: false }],
      review: { goals_total: 1, tasks_total: 1, tasks_done: 0, total_seconds: 0 },
    });

    const taskId = save.body.tasks[0].id;
    const updated = await request(app).put(path).set('Cookie', [cookie]).send({
      goals: [{ ...save.body.goals[0], text: 'Advanced physics' }],
      tasks: [{ id: taskId, text: 'Read chapter 1', done: true }],
      reflection: null,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.goals[0].text).toBe('Advanced physics');
    expect(updated.body.review.tasks_done).toBe(1);

    const get = await request(app).get(path).set('Cookie', [cookie]);
    expect(get.status).toBe(200);
    expect(get.body.reflection).toBeNull();
    expect(get.body.tasks).toHaveLength(1);
  });

  it('enforces valid calendar dates, goal limits, and ownership', async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    const firstSubject = await createTestSubject(first.user.id);

    const invalidDate = await request(app)
      .get('/api/planner/2026-02-30')
      .set('Cookie', [first.cookie]);
    expect(invalidDate.status).toBe(400);

    const tooManyGoals = await request(app)
      .put('/api/planner/2026-10-21')
      .set('Cookie', [first.cookie])
      .send({
        goals: Array.from({ length: 4 }, (_, index) => ({
          text: `Goal ${index}`,
          target_seconds: 60,
        })),
        tasks: [],
      });
    expect(tooManyGoals.status).toBe(400);
      expect(tooManyGoals.body.error.code).toBe('GOAL_LIMIT_REACHED');

    const saved = await request(app)
      .put('/api/planner/2026-10-21')
      .set('Cookie', [first.cookie])
      .send({
        goals: [{ text: 'Study', target_seconds: 60, subject_id: firstSubject.id }],
        tasks: [{ text: 'Private task', done: false }],
      });
    const foreignTaskId = saved.body.tasks[0].id;

    const foreignUpdate = await request(app)
      .put('/api/planner/2026-10-21')
      .set('Cookie', [second.cookie])
      .send({
        goals: [{ text: 'Own goal', target_seconds: 60 }],
        tasks: [{ id: foreignTaskId, text: 'Take over', done: true }],
      });
    expect(foreignUpdate.status).toBe(404);
  });

  it('carries unfinished tasks forward once and skips completed tasks', async () => {
    const { cookie } = await createTestUser();
    const save = await request(app)
      .put('/api/planner/2026-10-21')
      .set('Cookie', [cookie])
      .send({
        goals: [{ text: 'Study', target_seconds: 60 }],
        tasks: [
          { text: 'Incomplete', done: false },
          { text: 'Complete', done: true },
        ],
      });

    const firstCarry = await request(app)
      .post('/api/planner/2026-10-21/carry-over')
      .set('Cookie', [cookie]);
    const repeatedCarry = await request(app)
      .post('/api/planner/2026-10-21/carry-over')
      .set('Cookie', [cookie]);
    expect(firstCarry.body).toEqual({ carried: 1 });
    expect(repeatedCarry.body).toEqual({ carried: 0 });

    const nextDay = await request(app)
      .get('/api/planner/2026-10-22')
      .set('Cookie', [cookie]);
    expect(nextDay.body.tasks).toHaveLength(1);
    expect(nextDay.body.tasks[0]).toMatchObject({
      text: 'Incomplete',
      done: false,
      carried_over: true,
    });
    expect(save.body.tasks).toHaveLength(2);
  });
});