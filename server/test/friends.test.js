import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { canView } from '../src/modules/privacy/can-view.service.js';
import {
  cleanDb,
  createTestUser,
  getTestPool,
  setupTestDb,
  teardownTestDb,
} from './test-helper.js';

describe('Friends and privacy', () => {
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

  it('requires authentication and supports request listing, acceptance, friend listing and removal', async () => {
    const requester = await createTestUser({ username: 'requester' });
    const receiver = await createTestUser({ username: 'receiver' });
    expect((await request(app).get('/api/friends')).status).toBe(401);

    const sent = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [requester.cookie])
      .send({ username: receiver.user.username });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      from: { id: requester.user.id, username: requester.user.username },
      to: { id: receiver.user.id, username: receiver.user.username },
    });

    const lists = await request(app)
      .get('/api/friends/requests')
      .set('Cookie', [receiver.cookie]);
    expect(lists.status).toBe(200);
    expect(lists.body.incoming).toEqual([
      { id: sent.body.id, from: { id: requester.user.id, username: requester.user.username } },
    ]);
    expect(lists.body.outgoing).toEqual([]);

    const acceptedByWrongUser = await request(app)
      .patch(`/api/friends/requests/${sent.body.id}`)
      .set('Cookie', [requester.cookie])
      .send({ action: 'accept' });
    expect(acceptedByWrongUser.status).toBe(404);

    const accepted = await request(app)
      .patch(`/api/friends/requests/${sent.body.id}`)
      .set('Cookie', [receiver.cookie])
      .send({ action: 'accept' });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ ok: true });

    const friends = await request(app).get('/api/friends').set('Cookie', [requester.cookie]);
    expect(friends.status).toBe(200);
    expect(friends.body.items).toHaveLength(1);
    expect(friends.body.items[0]).toMatchObject({
      user_id: receiver.user.id,
      username: receiver.user.username,
      week_seconds: 0,
    });

    const removed = await request(app)
      .delete(`/api/friends/${receiver.user.id}`)
      .set('Cookie', [requester.cookie]);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ ok: true });
    expect((await request(app).get('/api/friends').set('Cookie', [requester.cookie])).body.items).toEqual([]);
  });

  it('rejects self and duplicate requests and resolves reciprocal requests into one friendship', async () => {
    const first = await createTestUser({ username: 'first' });
    const second = await createTestUser({ username: 'second' });

    const self = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [first.cookie])
      .send({ username: 'first' });
    expect(self.status).toBe(400);

    const sent = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [first.cookie])
      .send({ username: 'second' });
    const duplicate = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [first.cookie])
      .send({ username: 'second' });
    expect(sent.status).toBe(201);
    expect(duplicate.status).toBe(409);

    const reciprocal = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [second.cookie])
      .send({ username: 'first' });
    expect(reciprocal.status).toBe(201);
    const { rows } = await getTestPool().query(
      `SELECT id, status FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
      [first.user.id, second.user.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('accepted');
  });

  it('declines and permits a fresh request, while validating request identifiers and actions', async () => {
    const requester = await createTestUser({ username: 'decliner1' });
    const receiver = await createTestUser({ username: 'decliner2' });
    const sent = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [requester.cookie])
      .send({ username: 'decliner2' });

    const invalidId = await request(app)
      .patch('/api/friends/requests/not-a-uuid')
      .set('Cookie', [receiver.cookie])
      .send({ action: 'decline' });
    expect(invalidId.status).toBe(400);

    const invalidAction = await request(app)
      .patch(`/api/friends/requests/${sent.body.id}`)
      .set('Cookie', [receiver.cookie])
      .send({ action: 'reject' });
    expect(invalidAction.status).toBe(400);

    const declined = await request(app)
      .patch(`/api/friends/requests/${sent.body.id}`)
      .set('Cookie', [receiver.cookie])
      .send({ action: 'decline' });
    expect(declined.status).toBe(200);

    const resent = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [requester.cookie])
      .send({ username: 'decliner2' });
    expect(resent.status).toBe(201);
    expect(resent.body.id).toBe(sent.body.id);

    await request(app)
      .patch(`/api/friends/requests/${resent.body.id}`)
      .set('Cookie', [receiver.cookie])
      .send({ action: 'decline' });
    const reciprocal = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [receiver.cookie])
      .send({ username: 'decliner1' });
    const acceptedReciprocal = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [requester.cookie])
      .send({ username: 'decliner2' });
    expect(reciprocal.status).toBe(201);
    expect(acceptedReciprocal.status).toBe(201);
    const { rows } = await getTestPool().query(
      `SELECT status FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
      [requester.user.id, receiver.user.id]
    );
    expect(rows).toEqual([{ status: 'accepted' }]);
  });

  it('enforces privacy levels and denies access when either side blocks the other', async () => {
    const viewer = await createTestUser({ username: 'privacyviewer' });
    const target = await createTestUser({ username: 'privacytarget' });
    const pool = getTestPool();

    await pool.query(
      `UPDATE users SET privacy = $1::jsonb WHERE id = $2`,
      [JSON.stringify({ weekly_time: 'everyone', subjects: 'everyone' }), target.user.id]
    );
    expect(await canView(viewer.user.id, target.user.id, 'weekly_time')).toBe(true);
    expect(await canView(viewer.user.id, target.user.id, 'subjects')).toBe(true);

    await pool.query(
      `UPDATE users SET privacy = $1::jsonb WHERE id = $2`,
      [JSON.stringify({ weekly_time: 'friends', subjects: 'friends' }), target.user.id]
    );
    expect(await canView(viewer.user.id, target.user.id, 'weekly_time')).toBe(false);
    await pool.query(
      `INSERT INTO friendships (requester_id, receiver_id, status)
       VALUES ($1, $2, 'accepted')`,
      [viewer.user.id, target.user.id]
    );
    expect(await canView(viewer.user.id, target.user.id, 'weekly_time')).toBe(true);
    expect(await canView(viewer.user.id, target.user.id, 'subjects')).toBe(true);

    await pool.query(
      `UPDATE users SET privacy = $1::jsonb WHERE id = $2`,
      [JSON.stringify({ weekly_time: 'nobody', subjects: 'nobody' }), target.user.id]
    );
    expect(await canView(viewer.user.id, target.user.id, 'weekly_time')).toBe(false);
    expect(await canView(viewer.user.id, target.user.id, 'subjects')).toBe(false);

    await pool.query(
      'UPDATE users SET privacy = $1::jsonb WHERE id = $2',
      [JSON.stringify({ weekly_time: 'everyone', subjects: 'everyone' }), target.user.id]
    );
    await pool.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`,
      [target.user.id, viewer.user.id]
    );
    expect(await canView(viewer.user.id, target.user.id, 'weekly_time')).toBe(false);
    expect(await canView(viewer.user.id, target.user.id, 'subjects')).toBe(false);
    expect(await canView(viewer.user.id, '00000000-0000-0000-0000-000000000000', 'weekly_time')).toBe(false);
  });

  it('blocks both directions, removes friendship and requests, and supports unblock', async () => {
    const first = await createTestUser({ username: 'blocker1' });
    const second = await createTestUser({ username: 'blocker2' });
    const sent = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [first.cookie])
      .send({ username: 'blocker2' });

    const block = await request(app)
      .post('/api/blocks')
      .set('Cookie', [second.cookie])
      .send({ user_id: first.user.id });
    expect(block.status).toBe(200);
    expect(block.body).toEqual({ ok: true });
    expect((await request(app).get('/api/friends/requests').set('Cookie', [first.cookie])).body.incoming).toEqual([]);

    const blockedRequest = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [first.cookie])
      .send({ username: 'blocker2' });
    expect(blockedRequest.status).toBe(404);
    const unauthorizedUnblock = await request(app)
      .delete(`/api/blocks/${first.user.id}`)
      .set('Cookie', [first.cookie]);
    expect(unauthorizedUnblock.status).toBe(404);

    const unblocked = await request(app)
      .delete(`/api/blocks/${first.user.id}`)
      .set('Cookie', [second.cookie]);
    expect(unblocked.status).toBe(200);
    const resent = await request(app)
      .post('/api/friends/requests')
      .set('Cookie', [first.cookie])
      .send({ username: 'blocker2' });
    expect(resent.status).toBe(201);
    expect(resent.body.id).not.toBe(sent.body.id);

    await request(app)
      .patch(`/api/friends/requests/${resent.body.id}`)
      .set('Cookie', [second.cookie])
      .send({ action: 'accept' });
    const blockFriend = await request(app)
      .post('/api/blocks')
      .set('Cookie', [second.cookie])
      .send({ user_id: first.user.id });
    expect(blockFriend.status).toBe(200);
    const friends = await request(app).get('/api/friends').set('Cookie', [first.cookie]);
    expect(friends.body.items).toEqual([]);
  });

  it('returns null weekly time for friends who hide it and rejects self-blocks', async () => {
    const owner = await createTestUser({ username: 'privatefriend' });
    const friend = await createTestUser({ username: 'viewerfriend' });
    const pool = getTestPool();
    await pool.query(
      `INSERT INTO friendships (requester_id, receiver_id, status)
       VALUES ($1, $2, 'accepted')`,
      [owner.user.id, friend.user.id]
    );
    await pool.query(
      `UPDATE users SET privacy = '{"weekly_time":"nobody","subjects":"friends"}'::jsonb WHERE id = $1`,
      [owner.user.id]
    );
    await pool.query(
      `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
       VALUES ($1, CURRENT_DATE, 60, 60)`,
      [owner.user.id]
    );

    const friends = await request(app).get('/api/friends').set('Cookie', [friend.cookie]);
    expect(friends.body.items).toHaveLength(1);
    expect(friends.body.items[0].week_seconds).toBeNull();

    const selfBlock = await request(app)
      .post('/api/blocks')
      .set('Cookie', [friend.cookie])
      .send({ user_id: friend.user.id });
    expect(selfBlock.status).toBe(400);
  });
});
