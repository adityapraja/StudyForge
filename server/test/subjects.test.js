import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, cleanDb, createTestUser } from './test-helper.js';

describe('Subjects Module', () => {
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

  describe('POST /api/subjects', () => {
    it('creates a subject with valid name and hex color', async () => {
      const { cookie } = await createTestUser();

      const res = await request(app)
        .post('/api/subjects')
        .set('Cookie', [cookie])
        .send({
          name: 'Physics',
          color: '#4F8EF7',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Physics',
        color: '#4F8EF7',
      });
      expect(res.body.id).toBeDefined();
    });

    it('rejects duplicate subject name for the same user with 409 SUBJECT_NAME_TAKEN', async () => {
      const { cookie } = await createTestUser();

      await request(app)
        .post('/api/subjects')
        .set('Cookie', [cookie])
        .send({
          name: 'Physics',
          color: '#4F8EF7',
        });

      const res = await request(app)
        .post('/api/subjects')
        .set('Cookie', [cookie])
        .send({
          name: 'physics',
          color: '#00FF00',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SUBJECT_NAME_TAKEN');
    });

    it('rejects invalid color hex code with 400 VALIDATION_ERROR', async () => {
      const { cookie } = await createTestUser();

      const res = await request(app)
        .post('/api/subjects')
        .set('Cookie', [cookie])
        .send({
          name: 'Math',
          color: 'blue',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/subjects', () => {
    it('returns only the signed-in user subjects', async () => {
      const { cookie: user1Cookie } = await createTestUser({ email: 'u1@test.com' });
      const { cookie: user2Cookie } = await createTestUser({ email: 'u2@test.com' });

      await request(app)
        .post('/api/subjects')
        .set('Cookie', [user1Cookie])
        .send({ name: 'Physics', color: '#111111' });

      await request(app)
        .post('/api/subjects')
        .set('Cookie', [user2Cookie])
        .send({ name: 'Chemistry', color: '#222222' });

      const res = await request(app)
        .get('/api/subjects')
        .set('Cookie', [user1Cookie]);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Physics');
    });
  });

  describe('PATCH /api/subjects/:id', () => {
    it('renames and recolors a subject', async () => {
      const { cookie } = await createTestUser();

      const createRes = await request(app)
        .post('/api/subjects')
        .set('Cookie', [cookie])
        .send({ name: 'Physics', color: '#111111' });

      const subjectId = createRes.body.id;

      const res = await request(app)
        .patch(`/api/subjects/${subjectId}`)
        .set('Cookie', [cookie])
        .send({ name: 'Advanced Physics', color: '#333333' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Advanced Physics');
      expect(res.body.color).toBe('#333333');
    });
  });

  describe('DELETE /api/subjects/:id', () => {
    it('deletes the subject and returns { ok: true }', async () => {
      const { cookie } = await createTestUser();

      const createRes = await request(app)
        .post('/api/subjects')
        .set('Cookie', [cookie])
        .send({ name: 'History', color: '#444444' });

      const subjectId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/subjects/${subjectId}`)
        .set('Cookie', [cookie]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const listRes = await request(app)
        .get('/api/subjects')
        .set('Cookie', [cookie]);

      expect(listRes.body.length).toBe(0);
    });
  });
});

