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

describe('Leaderboards', () => {
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

  const setPrivacy = (pool, userId, value) => pool.query(
    'UPDATE users SET privacy = $1::jsonb WHERE id = $2',
    [JSON.stringify({ weekly_time: value, subjects: value }), userId]
  );

  const addCredit = async (pool, user, seconds, creditedAt, { source = 'timer', verified = true } = {}) => {
    const subject = await createTestSubject(user.user.id);
    const creditDate = creditedAt instanceof DateTime ? creditedAt.toJSDate() : creditedAt;
    const startDate = new Date(creditDate.getTime() - 60 * 60 * 1000);
    const { rows } = await pool.query(
      `INSERT INTO sessions
         (user_id, subject_id, started_at, ended_at, status, segment_started_at, study_seconds,
          source, verified, leaderboard_credited_seconds, leaderboard_credited_at)
       VALUES ($1, $2, $3, $4, 'ended', $3, $5, $6, $7, $8,
               CASE WHEN $8 > 0 THEN $4::timestamptz ELSE NULL::timestamptz END)
       RETURNING id`,
      [user.user.id, subject.id, startDate, creditDate, seconds, source, verified, seconds]
    );
    await pool.query(
      `INSERT INTO session_day_credits
         (session_id, user_id, day, original_verified_minutes, verified_minutes,
          original_leaderboard_credited_seconds, leaderboard_credited_seconds, credited_at)
       VALUES ($1, $2, $3, $4, $4, $5, $5, $6)`,
      [
        rows[0].id,
        user.user.id,
        DateTime.fromJSDate(creditDate).setZone(user.user.time_zone).toISODate(),
        seconds / 60,
        seconds,
        seconds > 0 ? creditDate : null,
      ]
    );
  };

  it('requires authentication and validates period, category and scope filters', async () => {
    const user = await createTestUser();
    expect((await request(app).get('/api/leaderboards')).status).toBe(401);
    expect((await request(app).get('/api/leaderboard')).status).toBe(401);

    for (const path of [
      '/api/leaderboards?period=year',
      '/api/leaderboard?period=year',
      '/api/leaderboards?category=unknown',
      '/api/leaderboards?scope=private',
    ]) {
      const response = await request(app).get(path).set('Cookie', [user.cookie]);
      expect(response.status).toBe(400);
    }
  });

  it('uses viewer-local boundaries and ranks only credited verified timer time', async () => {
    const viewer = await createTestUser({ time_zone: 'Asia/Kolkata', category: 'college' });
    const winner = await createTestUser({ time_zone: 'UTC', category: 'college' });
    const manual = await createTestUser({ time_zone: 'UTC', category: 'college' });
    const pool = getTestPool();
    const today = DateTime.now().setZone(viewer.user.time_zone).startOf('day');
    const currentWeek = today.startOf('week');
    const currentMonth = today.startOf('month');

    for (const [user, day, creditedSeconds] of [
      [winner, today, 3600],
      [winner, today.minus({ days: 1 }), 600],
      [winner, today.minus({ days: 30 }), 54000],
      [manual, today, 7200],
    ]) {
      const creditTime = day.set({ hour: 12 }).toUTC();
      if (user === manual) {
        await expect(addCredit(pool, user, creditedSeconds, creditTime, {
          source: 'manual',
          verified: false,
        })).rejects.toThrow();
      } else {
        await addCredit(pool, user, creditedSeconds, creditTime);
      }
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
         VALUES ($1, $2, 999, 999)`,
        [user.user.id, day.toISODate()]
      );
    }
    await setPrivacy(pool, winner.user.id, 'everyone');
    await setPrivacy(pool, manual.user.id, 'everyone');

    const dayBoard = await request(app)
      .get('/api/leaderboards?period=day&category=college')
      .set('Cookie', [viewer.cookie]);
    expect(dayBoard.status).toBe(200);
    expect(dayBoard.body.period_start).toBe(today.toISODate());
    expect(dayBoard.body.period_end).toBe(today.toISODate());
    expect(dayBoard.body.entries).toEqual([
      expect.objectContaining({ user_id: winner.user.id, seconds: 3600, rank: 1 }),
    ]);

    const weekBoard = await request(app)
      .get('/api/leaderboards?period=week')
      .set('Cookie', [viewer.cookie]);
    expect(weekBoard.body.period_start).toBe(currentWeek.toISODate());
    expect(weekBoard.body.period_end).toBe(currentWeek.plus({ days: 6 }).toISODate());
    expect(weekBoard.body.entries[0]).toMatchObject({
      user_id: winner.user.id,
      seconds: 4200,
    });
    expect(weekBoard.body.entries.some((entry) => entry.user_id === manual.user.id)).toBe(false);

    const monthBoard = await request(app)
      .get('/api/leaderboards?period=month')
      .set('Cookie', [viewer.cookie]);
    expect(monthBoard.body.period_start).toBe(currentMonth.toISODate());
    expect(monthBoard.body.period_end).toBe(currentMonth.endOf('month').toISODate());
  });

  it('excludes opted-out, non-visible and blocked users and preserves private self statistics', async () => {
    const viewer = await createTestUser({ username: 'boardviewer', category: 'college' });
    const publicUser = await createTestUser({ username: 'publicboard', category: 'college' });
    const friendsOnly = await createTestUser({ username: 'friendsonly', category: 'college' });
    const unrelatedFriendsOnly = await createTestUser({ username: 'unrelatedfriends', category: 'college' });
    const nobody = await createTestUser({ username: 'nobodyboard', category: 'college' });
    const hidden = await createTestUser({ username: 'hiddenboard', category: 'college' });
    const blocked = await createTestUser({ username: 'blockedboard', category: 'college' });
    const pool = getTestPool();
    await setPrivacy(pool, publicUser.user.id, 'everyone');
    await setPrivacy(pool, friendsOnly.user.id, 'friends');
    await setPrivacy(pool, unrelatedFriendsOnly.user.id, 'friends');
    await setPrivacy(pool, nobody.user.id, 'nobody');
    await setPrivacy(pool, hidden.user.id, 'everyone');
    await setPrivacy(pool, blocked.user.id, 'everyone');
    await pool.query('UPDATE users SET leaderboard_hidden = true WHERE id = $1', [hidden.user.id]);
    await pool.query(
      `INSERT INTO friendships (requester_id, receiver_id, status)
       VALUES ($1, $2, 'accepted')`,
      [viewer.user.id, friendsOnly.user.id]
    );
    await pool.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`,
      [viewer.user.id, blocked.user.id]
    );
    for (const user of [publicUser, friendsOnly, unrelatedFriendsOnly, nobody, hidden, blocked]) {
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
         VALUES ($1, CURRENT_DATE, 30, 30)`,
        [user.user.id]
      );
      await addCredit(pool, user, 1800, DateTime.now().toUTC());
    }

    const allBoard = await request(app)
      .get('/api/leaderboards?period=day&scope=all')
      .set('Cookie', [viewer.cookie]);
    const listed = allBoard.body.entries.map((entry) => entry.user_id);
    expect(listed).toContain(publicUser.user.id);
    expect(listed).toContain(friendsOnly.user.id);
    expect(listed).not.toContain(unrelatedFriendsOnly.user.id);
    expect(listed).not.toContain(nobody.user.id);
    expect(listed).not.toContain(hidden.user.id);
    expect(listed).not.toContain(blocked.user.id);

    const friendsBoard = await request(app)
      .get('/api/leaderboards?period=day&scope=friends')
      .set('Cookie', [viewer.cookie]);
    expect(friendsBoard.body.entries.map((entry) => entry.user_id)).toContain(friendsOnly.user.id);
    expect(friendsBoard.body.entries.map((entry) => entry.user_id)).not.toContain(publicUser.user.id);

    const optedOut = await request(app)
      .patch('/api/me')
      .set('Cookie', [viewer.cookie])
      .send({ leaderboard_hidden: true });
    expect(optedOut.status).toBe(200);
    expect(optedOut.body.leaderboard_hidden).toBe(true);
    const hiddenViewerBoard = await request(app)
      .get('/api/leaderboards?period=day')
      .set('Cookie', [viewer.cookie]);
    expect(hiddenViewerBoard.body.entries.map((entry) => entry.user_id)).not.toContain(viewer.user.id);
    expect(hiddenViewerBoard.body.me).toBeNull();

    const ownStats = await request(app)
      .get('/api/stats/progress?range=week')
      .set('Cookie', [viewer.cookie]);
    expect(ownStats.status).toBe(200);
  });

  it('uses exact credit timestamps to order ties by when the score was reached', async () => {
    const viewer = await createTestUser({ time_zone: 'Asia/Kolkata', category: 'college' });
    const earlier = await createTestUser({ time_zone: 'UTC', category: 'college' });
    const later = await createTestUser({ time_zone: 'UTC', category: 'college' });
    const pool = getTestPool();
    const today = DateTime.now().setZone(viewer.user.time_zone).startOf('day');
    await setPrivacy(pool, earlier.user.id, 'everyone');
    await setPrivacy(pool, later.user.id, 'everyone');
    await addCredit(pool, earlier, 1800, today.plus({ hours: 9 }));
    await addCredit(pool, earlier, 1800, today.plus({ hours: 11 }));
    await addCredit(pool, later, 3600, today.plus({ hours: 10 }));
    const board = await request(app)
      .get('/api/leaderboards?period=day')
      .set('Cookie', [viewer.cookie]);
    expect(board.status).toBe(200);
    expect(board.body.entries.slice(0, 2).map((entry) => entry.user_id)).toEqual([
      later.user.id,
      earlier.user.id,
    ]);
  });

  it('filters credit instants at exact viewer-local day boundaries and rejects uncredited eligibility', async () => {
    const viewer = await createTestUser({ time_zone: 'America/Los_Angeles', category: 'college' });
    const contributor = await createTestUser({ time_zone: 'Asia/Kolkata', category: 'college' });
    const pool = getTestPool();
    const localStart = DateTime.now().setZone(viewer.user.time_zone).startOf('day');
    const localEnd = localStart.plus({ days: 1 });
    await setPrivacy(pool, contributor.user.id, 'everyone');

    await addCredit(pool, contributor, 600, localStart.toUTC().minus({ milliseconds: 1 }));
    await addCredit(pool, contributor, 1200, localStart.toUTC());
    await addCredit(pool, contributor, 1800, localEnd.toUTC().minus({ milliseconds: 1 }));
    await addCredit(pool, contributor, 2400, localEnd.toUTC());
    await expect(addCredit(pool, contributor, 3600, localStart.plus({ hours: 12 }), {
      verified: false,
    })).rejects.toThrow();
    await expect(addCredit(pool, contributor, 7200, localStart.plus({ hours: 13 }), {
      source: 'manual',
      verified: false,
    })).rejects.toThrow();
    await addCredit(pool, contributor, 0, localStart.plus({ hours: 14 }));

    const board = await request(app)
      .get('/api/leaderboards?period=day')
      .set('Cookie', [viewer.cookie]);
    expect(board.status).toBe(200);
    expect(board.body.entries).toEqual([
      expect.objectContaining({ user_id: contributor.user.id, seconds: 3000, rank: 1 }),
    ]);
  });
});
