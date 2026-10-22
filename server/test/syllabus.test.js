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

describe('Syllabus Module', () => {
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

  const addTopic = async (subjectId, title, parentId = null, position = 0) => {
    const { rows } = await getTestPool().query(
      `INSERT INTO syllabus_topics (subject_id, parent_id, title, position)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [subjectId, parentId, title, position]
    );
    return rows[0].id;
  };

  it('requires authentication and hides subjects owned by another user', async () => {
    const { cookie: otherUserCookie } = await createTestUser();
    const owner = await createTestUser();
    const subject = await createTestSubject(owner.user.id);

    const anonymous = await request(app).get(`/api/subjects/${subject.id}/syllabus`);
    expect(anonymous.status).toBe(401);

    const unauthorized = await request(app)
      .get(`/api/subjects/${subject.id}/syllabus`)
      .set('Cookie', [otherUserCookie]);
    expect(unauthorized.status).toBe(404);
  });

  it('creates topics at POST /topics, maintains sibling order, and returns the documented syllabus shape', async () => {
    const { user, cookie } = await createTestUser();
    const subject = await createTestSubject(user.id);
    const first = await request(app)
      .post('/api/topics')
      .set('Cookie', [cookie])
      .send({ subject_id: subject.id, title: 'Mechanics' });
    const second = await request(app)
      .post('/api/topics')
      .set('Cookie', [cookie])
      .send({ subject_id: subject.id, title: 'Optics' });
    const child = await request(app)
      .post('/api/topics')
      .set('Cookie', [cookie])
      .send({ subject_id: subject.id, parent_id: first.body.id, title: 'Kinematics' });

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ title: 'Mechanics', status: 'not_started', position: 0 });
    expect(child.status).toBe(201);
    expect(second.body.position).toBe(1);

    await request(app)
      .patch(`/api/topics/${child.body.id}`)
      .set('Cookie', [cookie])
      .send({ status: 'done' })
      .expect(200);

    const syllabus = await request(app)
      .get(`/api/subjects/${subject.id}/syllabus`)
      .set('Cookie', [cookie]);
    expect(syllabus.status).toBe(200);
    expect(syllabus.body).toMatchObject({
      subject_id: subject.id,
      topics_total: 3,
      topics_done: 1,
      completion_percent: 33,
    });
    expect(syllabus.body.topics.map((topic) => topic.title)).toEqual(['Mechanics', 'Optics']);
    expect(syllabus.body.topics[0].children[0].title).toBe('Kinematics');
  });

  it('returns zero completion for an empty syllabus and counts parent statuses independently', async () => {
    const { user, cookie } = await createTestUser();
    const subject = await createTestSubject(user.id);

    const empty = await request(app)
      .get(`/api/subjects/${subject.id}/syllabus`)
      .set('Cookie', [cookie]);
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({
      subject_id: subject.id,
      completion_percent: 0,
      topics_total: 0,
      topics_done: 0,
      topics: [],
    });

    const parent = await addTopic(subject.id, 'Parent');
    await addTopic(subject.id, 'Child', parent);
    await getTestPool().query(
      "UPDATE syllabus_topics SET status = 'done' WHERE id = $1",
      [parent]
    );
    const syllabus = await request(app)
      .get(`/api/subjects/${subject.id}/syllabus`)
      .set('Cookie', [cookie]);
    expect(syllabus.body).toMatchObject({
      topics_total: 2,
      topics_done: 1,
      completion_percent: 50,
    });
  });

  it('rounds completion percentage to the nearest integer', async () => {
    const { user, cookie } = await createTestUser();
    const subject = await createTestSubject(user.id);
    const topicIds = [
      await addTopic(subject.id, 'One'),
      await addTopic(subject.id, 'Two'),
      await addTopic(subject.id, 'Three'),
    ];
    await getTestPool().query(
      "UPDATE syllabus_topics SET status = 'done' WHERE id = $1",
      [topicIds[0]]
    );

    const syllabus = await request(app)
      .get(`/api/subjects/${subject.id}/syllabus`)
      .set('Cookie', [cookie]);
    expect(syllabus.body.completion_percent).toBe(33);
  });

  it('updates title, status, parent, and position while rejecting invalid and circular parents', async () => {
    const { user, cookie } = await createTestUser();
    const subject = await createTestSubject(user.id);
    const otherSubject = await createTestSubject(user.id);
    const root = await addTopic(subject.id, 'Root');
    const child = await addTopic(subject.id, 'Child', root);
    const unrelatedSubjectTopic = await addTopic(otherSubject.id, 'Other');

    const updated = await request(app)
      .patch(`/api/topics/${child}`)
      .set('Cookie', [cookie])
      .send({ title: 'Renamed', status: 'in_progress', parent_id: null, position: 4 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      title: 'Renamed',
      status: 'in_progress',
      parent_id: null,
      position: 4,
    });

    const crossSubject = await request(app)
      .patch(`/api/topics/${root}`)
      .set('Cookie', [cookie])
      .send({ parent_id: unrelatedSubjectTopic });
    expect(crossSubject.status).toBe(400);
    expect(crossSubject.body.error.code).toBe('INVALID_PARENT');

    await request(app)
      .patch(`/api/topics/${child}`)
      .set('Cookie', [cookie])
      .send({ parent_id: root })
      .expect(200);
    const circular = await request(app)
      .patch(`/api/topics/${root}`)
      .set('Cookie', [cookie])
      .send({ parent_id: child });
    expect(circular.status).toBe(400);
    expect(circular.body.error.code).toBe('CIRCULAR_PARENT');

    const invalidStatus = await request(app)
      .patch(`/api/topics/${root}`)
      .set('Cookie', [cookie])
      .send({ status: 'finished' });
    expect(invalidStatus.status).toBe(400);
  });

  it('checks topic ownership and deletes a topic together with its descendants', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const subject = await createTestSubject(owner.user.id);
    const root = await addTopic(subject.id, 'Root');
    const child = await addTopic(subject.id, 'Child', root);

    const forbidden = await request(app)
      .patch(`/api/topics/${root}`)
      .set('Cookie', [other.cookie])
      .send({ title: 'Changed' });
    expect(forbidden.status).toBe(404);

    const deleted = await request(app)
      .delete(`/api/topics/${root}`)
      .set('Cookie', [owner.cookie]);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ ok: true });
    const { rows } = await getTestPool().query(
      'SELECT id FROM syllabus_topics WHERE id = ANY($1::uuid[])',
      [[root, child]]
    );
    expect(rows).toHaveLength(0);
  });

  it('refuses to cascade-delete descendants that violate the subject boundary', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const subject = await createTestSubject(owner.user.id);
    const otherSubject = await createTestSubject(other.user.id);
    const root = await addTopic(subject.id, 'Root');
    const crossSubjectChild = await addTopic(otherSubject.id, 'Invalid child', root);

    const deleted = await request(app)
      .delete(`/api/topics/${root}`)
      .set('Cookie', [owner.cookie]);
    expect(deleted.status).toBe(409);
    expect(deleted.body.error.code).toBe('INVALID_TOPIC_TREE');

    const { rows } = await getTestPool().query(
      'SELECT id FROM syllabus_topics WHERE id = ANY($1::uuid[])',
      [[root, crossSubjectChild]]
    );
    expect(rows).toHaveLength(2);
  });

  it('imports nested text, preserves order, and returns the created count', async () => {
    const { user, cookie } = await createTestUser();
    const subject = await createTestSubject(user.id);
    const imported = await request(app)
      .post(`/api/subjects/${subject.id}/syllabus/import`)
      .set('Cookie', [cookie])
      .send({ text: 'Mechanics\n  Kinematics\n  Dynamics\nOptics\n\tReflection' });

    expect(imported.status).toBe(201);
    expect(imported.body).toEqual({ created: 5 });
    const syllabus = await request(app)
      .get(`/api/subjects/${subject.id}/syllabus`)
      .set('Cookie', [cookie]);
    expect(syllabus.body.topics.map((topic) => topic.title)).toEqual(['Mechanics', 'Optics']);
    expect(syllabus.body.topics[0].children.map((topic) => topic.title)).toEqual(['Kinematics', 'Dynamics']);
    expect(syllabus.body.topics[1].children[0].title).toBe('Reflection');
  });

  it('rejects invalid indentation, imports over 500 lines, and imports into unowned subjects', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const subject = await createTestSubject(owner.user.id);

    const invalidIndent = await request(app)
      .post(`/api/subjects/${subject.id}/syllabus/import`)
      .set('Cookie', [owner.cookie])
      .send({ text: 'Root\n    Child\n     Invalid jump' });
    expect(invalidIndent.status).toBe(400);
    expect(invalidIndent.body.error.code).toBe('INVALID_IMPORT');

    const emptyImport = await request(app)
      .post(`/api/subjects/${subject.id}/syllabus/import`)
      .set('Cookie', [owner.cookie])
      .send({ text: ' \n \t\n' });
    expect(emptyImport.status).toBe(400);

    const tooManyLines = await request(app)
      .post(`/api/subjects/${subject.id}/syllabus/import`)
      .set('Cookie', [owner.cookie])
      .send({ text: Array.from({ length: 501 }, (_, index) => `Topic ${index}`).join('\n') });
    expect(tooManyLines.status).toBe(400);

    const unauthorized = await request(app)
      .post(`/api/subjects/${subject.id}/syllabus/import`)
      .set('Cookie', [other.cookie])
      .send({ text: 'Topic' });
    expect(unauthorized.status).toBe(404);

    const exactlyLimit = await request(app)
      .post(`/api/subjects/${subject.id}/syllabus/import`)
      .set('Cookie', [owner.cookie])
      .send({ text: Array.from({ length: 500 }, (_, index) => `Topic ${index}`).join('\n') });
    expect(exactlyLimit.status).toBe(201);
    expect(exactlyLimit.body).toEqual({ created: 500 });
  });
});
