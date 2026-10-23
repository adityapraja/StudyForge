import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, cleanDb, createTestUser, getTestPool } from './test-helper.js';

describe('Me (User Profile & Progression) Module', () => {
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

  describe('GET /api/me', () => {
    it('returns the current user profile', async () => {
      const { user, cookie } = await createTestUser({
        email: 'user@example.com',
        username: 'sam',
        time_zone: 'Asia/Kolkata',
        category: 'college',
      });

      const res = await request(app)
        .get('/api/me')
        .set('Cookie', [cookie]);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: user.id,
        email: 'user@example.com',
        username: 'sam',
        time_zone: 'Asia/Kolkata',
        category: 'college',
        leaderboard_hidden: false,
        xp: 0,
        level: 1,
        streak_minimum_minutes: 15,
      });
      expect(res.body.privacy).toBeDefined();
    });
  });

  describe('PATCH /api/me', () => {
    it('updates user profile fields and privacy', async () => {
      const { cookie } = await createTestUser({ username: 'oldname' });

      const res = await request(app)
        .patch('/api/me')
        .set('Cookie', [cookie])
        .send({
          username: 'newname',
          category: 'professional',
          leaderboard_hidden: true,
          privacy: { weekly_time: 'nobody' },
        });

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('newname');
      expect(res.body.category).toBe('professional');
      expect(res.body.leaderboard_hidden).toBe(true);
      expect(res.body.privacy.weekly_time).toBe('nobody');
      expect(res.body.privacy.subjects).toBe('friends'); // Preserves other privacy fields
    });

    it('rejects duplicate username with 409 USERNAME_TAKEN', async () => {
      await createTestUser({ username: 'existing_user' });
      const { cookie } = await createTestUser({ username: 'my_user' });

      const res = await request(app)
        .patch('/api/me')
        .set('Cookie', [cookie])
        .send({ username: 'Existing_User' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USERNAME_TAKEN');
    });

    it('rejects invalid time-zone identifiers', async () => {
      const { cookie } = await createTestUser();
      const res = await request(app)
        .patch('/api/me')
        .set('Cookie', [cookie])
        .send({ time_zone: 'Not/A_Real_Zone' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields.time_zone).toBeDefined();
    });
  });

  describe('GET /api/me/xp', () => {
    it('returns level, xp, xp_in_level and xp_for_next_level matching API spec formula', async () => {
      // 1240 XP corresponds to level 5 with 140 in level and 400 needed for next level
      const { user, cookie } = await createTestUser();
      const pool = getTestPool();
      await pool.query('UPDATE users SET xp = 1240, level = 5 WHERE id = $1', [user.id]);

      const res = await request(app)
        .get('/api/me/xp')
        .set('Cookie', [cookie]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        xp: 1240,
        level: 5,
        xp_in_level: 140,
        xp_for_next_level: 400,
      });
    });
  });

  describe('GET /api/me/streak', () => {
    it('returns current and longest streak and freeze availability', async () => {
      const { user, cookie } = await createTestUser({ streak_minimum_minutes: 20 });
      const pool = getTestPool();
      await pool.query(
        'UPDATE streaks SET current = 5, longest = 12, freezes_used = 0 WHERE user_id = $1',
        [user.id]
      );

      const res = await request(app)
        .get('/api/me/streak')
        .set('Cookie', [cookie]);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        current: 5,
        longest: 12,
        today_minutes: 0,
        minimum_minutes: 20,
        today_counted: false,
        freeze_available: true,
      });
    });
  });

  describe('GET and PUT /api/me/goals', () => {
    it('gets goals and today/week progress', async () => {
      const { cookie } = await createTestUser();

      const res = await request(app)
        .get('/api/me/goals')
        .set('Cookie', [cookie]);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        daily_target_seconds: 14400,
        weekly_target_seconds: 72000,
        streak_minimum_minutes: 15,
        today_seconds: 0,
        week_seconds: 0,
      });
    });

    it('updates daily and weekly study targets and streak minimum', async () => {
      const { cookie } = await createTestUser();

      const res = await request(app)
        .put('/api/me/goals')
        .set('Cookie', [cookie])
        .send({
          daily_target_seconds: 18000,
          weekly_target_seconds: 90000,
          streak_minimum_minutes: 30,
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        daily_target_seconds: 18000,
        weekly_target_seconds: 90000,
        streak_minimum_minutes: 30,
      });
    });
  });
});
