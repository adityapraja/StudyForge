import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, cleanDb, getTestPool } from './test-helper.js';

describe('Auth Module', () => {
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

  describe('POST /api/auth/register', () => {
    it('successfully registers a new user, returns User JSON and sets httpOnly token cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'adi@example.com',
          password: 'password123',
          username: 'adi',
          time_zone: 'Asia/Kolkata',
          category: 'college',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        email: 'adi@example.com',
        username: 'adi',
        time_zone: 'Asia/Kolkata',
        category: 'college',
        leaderboard_hidden: false,
        xp: 0,
        level: 1,
        streak_minimum_minutes: 15,
      });
      expect(res.body.id).toBeDefined();

      // Check cookie header
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/token=/);
      expect(cookies[0]).toMatch(/HttpOnly/i);

      // Verify password was hashed in database
      const pool = getTestPool();
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', ['adi@example.com']);
      expect(rows.length).toBe(1);
      expect(rows[0].password_hash).not.toBe('password123');
      const isHash = await bcrypt.compare('password123', rows[0].password_hash);
      expect(isHash).toBe(true);
    });

    it('rejects duplicate email with 409 EMAIL_TAKEN', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'adi@example.com',
          password: 'password123',
          username: 'adi1',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'ADI@EXAMPLE.COM',
          password: 'password456',
          username: 'adi2',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('rejects duplicate username case-insensitively with 409 USERNAME_TAKEN', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'first@example.com',
          password: 'password123',
          username: 'Aditya',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'second@example.com',
          password: 'password123',
          username: 'aditya',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USERNAME_TAKEN');
    });

    it('validates input and returns 400 VALIDATION_ERROR for short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short',
          username: 'validuser',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields.password).toBeDefined();
    });

    it('rejects invalid time-zone identifiers', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-zone@example.com',
          password: 'password123',
          username: 'invalidzone',
          time_zone: 'Not/A_Real_Zone',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields.time_zone).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'adi@example.com',
          password: 'password123',
          username: 'adi',
        });
    });

    it('logs in with correct credentials and returns User object and cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'adi@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('adi@example.com');
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/token=/);
    });

    it('rejects incorrect password with 401 INVALID_CREDENTIALS', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'adi@example.com',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects unknown email with 401 INVALID_CREDENTIALS (same message)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unknown@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears token cookie and returns ok: true', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('Auth Middleware', () => {
    it('rejects unauthenticated requests to protected routes with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .get('/api/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects invalid token with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('Cookie', ['token=invalid-jwt-token']);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });
});
