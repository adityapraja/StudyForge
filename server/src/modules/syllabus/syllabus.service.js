import { query, withTransaction } from '../../db.js';
import { AppError } from '../../middleware/error-handler.js';
import { awardTopicCompletionXp } from '../progression/xp.service.js';

const topicFields = 'id, subject_id, parent_id, title, status, position';

const ensureOwnedSubject = async (userId, subjectId, client = null) => {
  const execute = client ? client.query.bind(client) : query;
  const { rows } = await execute(
    `SELECT id FROM subjects WHERE id = $1 AND user_id = $2`,
    [subjectId, userId]
  );
  if (rows.length === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Subject not found');
  }
};

const getCompletionStats = (topics) => {
  const topicsTotal = topics.length;
  const topicsDone = topics.filter((topic) => topic.status === 'done').length;
  return {
    topics_total: topicsTotal,
    topics_done: topicsDone,
    completion_percent: topicsTotal === 0 ? 0 : Math.round((topicsDone / topicsTotal) * 100),
  };
};

const buildTopicTree = (topics) => {
  const byId = new Map(
    topics.map((topic) => [topic.id, { ...topic, children: [] }])
  );
  const roots = [];

  for (const topic of byId.values()) {
    const parent = topic.parent_id && byId.get(topic.parent_id);
    if (parent) {
      parent.children.push(topic);
    } else {
      roots.push(topic);
    }
  }

  const order = (a, b) => a.position - b.position
    || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    || a.id.localeCompare(b.id);
  const sortBranch = (items) => {
    items.sort(order);
    for (const item of items) sortBranch(item.children);
  };
  sortBranch(roots);
  return roots;
};

export const getSyllabus = async (userId, subjectId) => {
  await ensureOwnedSubject(userId, subjectId);
  const { rows } = await query(
    `SELECT ${topicFields}, created_at
     FROM syllabus_topics
     WHERE subject_id = $1`,
    [subjectId]
  );

  return {
    subject_id: subjectId,
    ...getCompletionStats(rows),
    topics: buildTopicTree(rows),
  };
};

export const createTopic = async (userId, { subject_id: subjectId, parent_id: parentId = null, title, position }) =>
  withTransaction(async (client) => {
    await ensureOwnedSubject(userId, subjectId, client);

    if (parentId) {
      const { rows: parents } = await client.query(
        `SELECT id FROM syllabus_topics WHERE id = $1 AND subject_id = $2`,
        [parentId, subjectId]
      );
      if (parents.length === 0) {
        throw new AppError(400, 'INVALID_PARENT', 'Parent topic must belong to this subject');
      }
    }

    const { rows } = await client.query(
      `INSERT INTO syllabus_topics (subject_id, parent_id, title, position)
       VALUES (
         $1,
         $2,
         $3,
         COALESCE($4, (
           SELECT COALESCE(MAX(position) + 1, 0)
           FROM syllabus_topics
           WHERE subject_id = $1 AND parent_id IS NOT DISTINCT FROM $2
         ))
       )
       RETURNING ${topicFields}`,
      [subjectId, parentId, title, position ?? null]
    );
    return rows[0];
  });

export const updateTopic = async (userId, topicId, updates) =>
  withTransaction(async (client) => {
    const { rows: existingRows } = await client.query(
      `SELECT topic.id, topic.subject_id, topic.parent_id, topic.status
       FROM syllabus_topics topic
       JOIN subjects ON subjects.id = topic.subject_id
       WHERE topic.id = $1 AND subjects.user_id = $2
       FOR UPDATE OF topic`,
      [topicId, userId]
    );
    const existing = existingRows[0];
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Topic not found');
    }

    if (updates.parent_id !== undefined && updates.parent_id !== null) {
      const { rows: parents } = await client.query(
        `SELECT id FROM syllabus_topics WHERE id = $1 AND subject_id = $2`,
        [updates.parent_id, existing.subject_id]
      );
      if (parents.length === 0) {
        throw new AppError(400, 'INVALID_PARENT', 'Parent topic must belong to this subject');
      }

      const { rows: descendants } = await client.query(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM syllabus_topics WHERE id = $1
           UNION
           SELECT child.id
           FROM syllabus_topics child
           JOIN descendants parent ON child.parent_id = parent.id
         )
         SELECT id FROM descendants WHERE id = $2`,
        [topicId, updates.parent_id]
      );
      if (descendants.length > 0) {
        throw new AppError(400, 'CIRCULAR_PARENT', 'A topic cannot be nested beneath itself or its descendants');
      }
    }

    const columns = [];
    const values = [];
    for (const field of ['title', 'status', 'parent_id', 'position']) {
      if (updates[field] !== undefined) {
        values.push(updates[field]);
        columns.push(`${field} = $${values.length}`);
      }
    }

    values.push(topicId);
    const { rows } = await client.query(
      `UPDATE syllabus_topics
       SET ${columns.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING ${topicFields}`,
      values
    );

    let xpAwarded = 0;
    if (updates.status === 'done') {
      const awardResult = await awardTopicCompletionXp(client, userId, topicId);
      if (awardResult.awarded) {
        xpAwarded = awardResult.xp;
      }
    }

    if (xpAwarded > 0) {
      return {
        ...rows[0],
        xp_awarded: xpAwarded,
      };
    }

    return rows[0];
  });

export const deleteTopic = async (userId, topicId) => withTransaction(async (client) => {
  const { rows: topicRows } = await client.query(
    `SELECT topic.id, topic.subject_id
     FROM syllabus_topics topic
     JOIN subjects ON subjects.id = topic.subject_id
     WHERE topic.id = $1 AND subjects.user_id = $2
     FOR UPDATE OF topic`,
    [topicId, userId]
  );
  const topic = topicRows[0];
  if (!topic) {
    throw new AppError(404, 'NOT_FOUND', 'Topic not found');
  }

  const { rows: invalidDescendants } = await client.query(
    `WITH RECURSIVE descendants AS (
       SELECT id, subject_id FROM syllabus_topics WHERE id = $1
       UNION
       SELECT child.id, child.subject_id
       FROM syllabus_topics child
       JOIN descendants parent ON child.parent_id = parent.id
     )
     SELECT id FROM descendants
     WHERE id <> $1 AND subject_id <> $2
     LIMIT 1`,
    [topicId, topic.subject_id]
  );
  if (invalidDescendants.length > 0) {
    throw new AppError(409, 'INVALID_TOPIC_TREE', 'Cannot delete a topic with descendants from another subject');
  }

  await client.query('DELETE FROM syllabus_topics WHERE id = $1', [topicId]);
  return { ok: true };
});

export const parseImportedTopics = (text) => {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > 500) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Import cannot exceed 500 lines');
  }

  const topics = [];
  const parentStack = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;

    const indent = line.match(/^[ \t]*/)[0];
    if (indent.includes(' ') && indent.includes('\t')) {
      throw new AppError(400, 'INVALID_IMPORT', `Line ${index + 1} mixes tabs and spaces`);
    }
    if (indent.includes(' ') && indent.length % 2 !== 0) {
      throw new AppError(400, 'INVALID_IMPORT', `Line ${index + 1} must indent with pairs of spaces`);
    }
    const depth = indent.includes('\t') ? indent.length : indent.length / 2;
    const title = line.slice(indent.length).trim();
    if (title.length === 0 || title.length > 200) {
      throw new AppError(400, 'INVALID_IMPORT', `Line ${index + 1} must contain a title of 1 to 200 characters`);
    }
    if (depth > parentStack.length) {
      throw new AppError(400, 'INVALID_IMPORT', `Line ${index + 1} skips a nesting level`);
    }
    const parentIndex = depth - 1;
    const parentTopicIndex = depth === 0 ? -1 : parentStack[parentIndex];
    parentStack.length = depth;
    topics.push({ title, parent_index: parentTopicIndex });
    parentStack[depth] = topics.length - 1;
  }
  return topics;
};

export const importTopics = async (userId, subjectId, text) => {
  const topics = parseImportedTopics(text);
  await withTransaction(async (client) => {
    await ensureOwnedSubject(userId, subjectId, client);
    const insertedIds = [];
    const siblingPositions = new Map();

    for (const topic of topics) {
      const parentId = topic.parent_index < 0 ? null : insertedIds[topic.parent_index];
      const parentKey = parentId || 'root';
      if (!siblingPositions.has(parentKey)) {
        const { rows: positionRows } = await client.query(
          `SELECT COALESCE(MAX(position) + 1, 0) AS next_position
           FROM syllabus_topics
           WHERE subject_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
          [subjectId, parentId]
        );
        siblingPositions.set(parentKey, Number(positionRows[0].next_position));
      }
      const position = siblingPositions.get(parentKey);
      siblingPositions.set(parentKey, position + 1);
      const { rows } = await client.query(
        `INSERT INTO syllabus_topics (subject_id, parent_id, title, position)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [subjectId, parentId, topic.title, position]
      );
      insertedIds.push(rows[0].id);
    }
  });
  return { created: topics.length };
};
