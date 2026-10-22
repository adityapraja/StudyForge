import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app.js';
import {
  cleanDb,
  createTestSubject,
  createTestUser,
  getTestPool,
  setupTestDb,
  teardownTestDb,
} from './test-helper.js';

describe('Friends and leaderboards', () => {
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

  it('sends, lists, accepts, and enforces weekly-time privacy on friend requests', async () => {
    const alice = await createTestUser({ username: 'alice' });
    const bob = await createTestUser({ username: 'bob' });
    const aliceRequest = request(app).set('Cookie', alice.cookie);
    const bobRequest = request(app).set('Cookie', bob.cookie);

    const sent = await aliceRequest.post('/api/friends/requests').send({ username: 'BOB' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ requester_id: alice.user.id, receiver_id: bob.user.id, status: 'pending' });
    expect((await aliceRequest.get('/api/friends/requests')).body.outgoing).toHaveLength(1);
    expect((await bobRequest.get('/api/friends/requests')).body.incoming[0].from.username).toBe('alice');

    const accepted = await bobRequest
      .patch(`/api/friends/requests/${sent.body.id}`)
      .send({ action: 'accept' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('accepted');

    const pool = getTestPool();
    await pool.query(
      `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
       VALUES ($1, $2, 25, 25)`,
      [bob.user.id, DateTime.now().setZone('UTC').toISODate()]
    );
    const bobSubject = await createTestSubject(bob.user.id, { name: 'Biology' });
    await pool.query(
      `INSERT INTO subject_daily_totals (user_id, subject_id, day, minutes, verified_minutes)
       VALUES ($1, $2, $3, 10, 10)`,
      [bob.user.id, bobSubject.id, DateTime.now().setZone('UTC').toISODate()]
    );
    expect((await aliceRequest.get('/api/friends')).body.items[0]).toMatchObject({
      user_id: bob.user.id,
      username: 'bob',
      week_seconds: 1500,
    });
    expect((await aliceRequest.get('/api/friends')).body.items[0].subjects).toEqual([
      { subject_id: bobSubject.id, name: 'Biology', color: '#4F8EF7', seconds: 600 },
    ]);

    await pool.query(
      `UPDATE users SET privacy = privacy || '{"weekly_time":"nobody","subjects":"nobody"}'::jsonb WHERE id = $1`,
      [bob.user.id]
    );
    const hiddenStats = (await aliceRequest.get('/api/friends')).body.items[0];
    expect(hiddenStats.week_seconds).toBeNull();
    expect(hiddenStats.subjects).toBeNull();
    expect((await aliceRequest.post('/api/friends/requests').send({ username: 'bob' })).status).toBe(409);
  });

  it('does not expose blocked users and removes existing relationships when blocking', async () => {
    const alice = await createTestUser({ username: 'alice' });
    const bob = await createTestUser({ username: 'bob' });
    const pool = getTestPool();
    await pool.query(
      `INSERT INTO friendships (requester_id, receiver_id, status)
       VALUES ($1, $2, 'accepted')`,
      [alice.user.id, bob.user.id]
    );

    const block = await request(app)
      .post('/api/blocks')
      .set('Cookie', alice.cookie)
      .send({ user_id: bob.user.id });
    expect(block.status).toBe(201);
    expect((await request(app).get('/api/friends').set('Cookie', alice.cookie)).body.items).toHaveLength(0);
    expect((await request(app).get('/api/blocks').set('Cookie', alice.cookie)).body.items).toEqual([
      { user_id: bob.user.id, username: 'bob' },
    ]);
    expect((await request(app)
      .post('/api/friends/requests')
      .set('Cookie', bob.cookie)
      .send({ username: 'alice' })).body.error.code).toBe('NOT_FOUND');

    const unblocked = await request(app)
      .delete(`/api/blocks/${bob.user.id}`)
      .set('Cookie', alice.cookie);
    expect(unblocked.status).toBe(200);
    expect(unblocked.body).toEqual({ ok: true });
    expect((await request(app).get('/api/blocks').set('Cookie', alice.cookie)).body.items).toHaveLength(0);
  });

  it('ranks verified timer sessions by period, scope, privacy opt-out, and tie-break time', async () => {
    const alice = await createTestUser({ username: 'alice', category: 'college' });
    const bob = await createTestUser({ username: 'bob', category: 'college' });
    const carol = await createTestUser({ username: 'carol', category: 'college' });
    const hidden = await createTestUser({ username: 'hidden', category: 'college' });
    const pool = getTestPool();
    const subjects = await Promise.all([
      createTestSubject(alice.user.id),
      createTestSubject(bob.user.id),
      createTestSubject(carol.user.id),
      createTestSubject(hidden.user.id),
    ]);
    await pool.query(
      `INSERT INTO friendships (requester_id, receiver_id, status)
       VALUES ($1, $2, 'accepted')`,
      [alice.user.id, bob.user.id]
    );
    await pool.query('UPDATE users SET leaderboard_hidden = true WHERE id = $1', [hidden.user.id]);

    const insertSession = (userId, subjectId, seconds, source, verified, minutesAgo) => pool.query(
      `INSERT INTO sessions
         (user_id, subject_id, started_at, ended_at, status, segment_started_at,
          study_seconds, source, verified)
       VALUES ($1, $2, NOW() - ($6 * INTERVAL '1 minute'),
          NOW() - (($6 - 1) * INTERVAL '1 minute'), 'ended',
          NOW() - ($6 * INTERVAL '1 minute'), $3, $4, $5)`,
      [userId, subjectId, seconds, source, verified, minutesAgo]
    );
    await insertSession(alice.user.id, subjects[0].id, 1800, 'timer', true, 20);
    await insertSession(bob.user.id, subjects[1].id, 1800, 'timer', true, 10);
    await insertSession(carol.user.id, subjects[2].id, 3600, 'timer', true, 15);
    await insertSession(hidden.user.id, subjects[3].id, 7200, 'timer', true, 5);
    await insertSession(carol.user.id, subjects[2].id, 9000, 'manual', false, 4);

    const publicBoard = await request(app)
      .get('/api/leaderboards?period=week&category=college&scope=all')
      .set('Cookie', alice.cookie);
    expect(publicBoard.status).toBe(200);
    expect(publicBoard.body.entries.map((entry) => entry.username)).toEqual(['carol', 'bob', 'alice']);
    expect(publicBoard.body.me).toMatchObject({ rank: 3, seconds: 1800 });

    const friendsBoard = await request(app)
      .get('/api/leaderboards?period=week&scope=friends')
      .set('Cookie', alice.cookie);
    expect(friendsBoard.status).toBe(200);
    expect(friendsBoard.body.entries.map((entry) => entry.username)).toEqual(['bob', 'alice']);
  });
});
