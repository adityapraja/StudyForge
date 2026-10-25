import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, cleanDb, createTestUser, createTestSubject, getTestPool } from './test-helper.js';

describe('Session CSV export', () => {
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

  it('exports only the authenticated user sessions and escapes CSV values', async () => {
    const first = await createTestUser({ time_zone: 'Asia/Kolkata' });
    const second = await createTestUser();
    const subject = await createTestSubject(first.user.id, { name: 'Physics, "Advanced"' });
    const otherSubject = await createTestSubject(second.user.id);
    const pool = getTestPool();
    await pool.query(
      `INSERT INTO sessions
         (user_id, subject_id, started_at, ended_at, status, segment_started_at, study_seconds, note)
       VALUES
         ($1, $2, '2026-10-21T20:00:00Z', '2026-10-21T20:30:00Z', 'ended',
         '2026-10-21T20:00:00Z', 1800, $3),
         ($4, $5, '2026-10-21T11:00:00Z', '2026-10-21T11:30:00Z', 'ended',
          '2026-10-21T11:00:00Z', 1800, 'private')`,
      [first.user.id, subject.id, '=SUM(1,2), "deep"\nnotes', second.user.id, otherSubject.id]
    );

    const response = await request(app)
      .get('/api/me/export.csv')
      .set('Cookie', [first.cookie]);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('study-sessions.csv');
    expect(response.text).toContain('"date","subject","start","end","duration_minutes","note"');
    expect(response.text).toContain('"2026-10-22"');
    expect(response.text).toContain('"Physics, ""Advanced"""');
    expect(response.text).toContain(`"'=SUM(1,2), ""deep""\nnotes"`);
    expect(response.text).not.toContain('private');
    expect(response.text).not.toContain('password_hash');

    const extensionlessResponse = await request(app)
      .get('/api/me/export')
      .set('Cookie', [first.cookie]);
    expect(extensionlessResponse.status).toBe(200);
    expect(extensionlessResponse.headers['content-type']).toContain('text/csv');
    expect(extensionlessResponse.text).toBe(response.text);
  });

  it('requires authentication and returns a header for an empty export', async () => {
    const unauthenticated = await request(app).get('/api/me/export.csv');
    expect(unauthenticated.status).toBe(401);

    const { cookie } = await createTestUser();
    const response = await request(app)
      .get('/api/me/export.csv')
      .set('Cookie', [cookie]);
    expect(response.status).toBe(200);
    expect(response.text.split('\r\n')).toHaveLength(2);
  });
});