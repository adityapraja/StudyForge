import { DateTime } from 'luxon';
import { query, withTransaction } from '../../db.js';
import { AppError } from '../../middleware/error-handler.js';

export const getPlanner = async (user, date) => {
  const [day, goals, tasks, totals] = await Promise.all([
    query(
      'SELECT reflection FROM planner_days WHERE user_id = $1 AND date = $2',
      [user.id, date]
    ),
    query(
      `SELECT id, subject_id, text, target_seconds
       FROM planner_goals
       WHERE user_id = $1 AND date = $2
       ORDER BY created_at, id`,
      [user.id, date]
    ),
    query(
      `SELECT id, text, done, carried_over
       FROM tasks
       WHERE user_id = $1 AND date = $2
       ORDER BY created_at, id`,
      [user.id, date]
    ),
    query(
      'SELECT minutes FROM daily_totals WHERE user_id = $1 AND day = $2',
      [user.id, date]
    ),
  ]);

  const goalResults = await Promise.all(goals.rows.map(async (goal) => {
    const result = goal.subject_id
      ? await query(
        `SELECT minutes FROM subject_daily_totals
         WHERE user_id = $1 AND subject_id = $2 AND day = $3`,
        [user.id, goal.subject_id, date]
      )
      : totals;
    return (result.rows[0]?.minutes || 0) * 60 >= goal.target_seconds;
  }));

  return {
    date,
    goals: goals.rows,
    tasks: tasks.rows,
    reflection: day.rows[0]?.reflection ?? null,
    review: {
      total_seconds: (totals.rows[0]?.minutes || 0) * 60,
      goals_met: goalResults.filter(Boolean).length,
      goals_total: goals.rows.length,
      tasks_done: tasks.rows.filter((task) => task.done).length,
      tasks_total: tasks.rows.length,
    },
  };
};

const assertGoalSubjectsBelongToUser = async (client, userId, goals) => {
  const subjectIds = [...new Set(goals.map((goal) => goal.subject_id).filter(Boolean))];
  if (subjectIds.length === 0) return;

  const { rows } = await client.query(
    'SELECT id FROM subjects WHERE user_id = $1 AND id = ANY($2::uuid[])',
    [userId, subjectIds]
  );
  if (rows.length !== subjectIds.length) {
    throw new AppError(404, 'NOT_FOUND', 'Subject not found');
  }
};

export const savePlanner = async (user, date, body) => {
  await withTransaction(async (client) => {
    await assertGoalSubjectsBelongToUser(client, user.id, body.goals);
    await client.query(
      `INSERT INTO planner_days (user_id, date, reflection)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, date)
       DO UPDATE SET reflection = EXCLUDED.reflection, updated_at = NOW()`,
      [user.id, date, body.reflection ?? null]
    );

    const goalIds = [];
    for (const goal of body.goals) {
      if (goal.id) {
        const { rows } = await client.query(
          `UPDATE planner_goals
           SET subject_id = $1, text = $2, target_seconds = $3, updated_at = NOW()
           WHERE id = $4 AND user_id = $5 AND date = $6
           RETURNING id`,
          [goal.subject_id ?? null, goal.text, goal.target_seconds, goal.id, user.id, date]
        );
        if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', 'Goal not found');
        goalIds.push(goal.id);
      } else {
        const { rows } = await client.query(
          `INSERT INTO planner_goals (user_id, date, subject_id, text, target_seconds)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [user.id, date, goal.subject_id ?? null, goal.text, goal.target_seconds]
        );
        goalIds.push(rows[0].id);
      }
    }
    await client.query(
      `DELETE FROM planner_goals
       WHERE user_id = $1 AND date = $2 AND NOT (id = ANY($3::uuid[]))`,
      [user.id, date, goalIds]
    );

    const taskIds = [];
    for (const task of body.tasks) {
      if (task.id) {
        const { rows } = await client.query(
          `UPDATE tasks
           SET text = $1, done = $2, updated_at = NOW()
           WHERE id = $3 AND user_id = $4 AND date = $5
           RETURNING id`,
          [task.text, task.done, task.id, user.id, date]
        );
        if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', 'Task not found');
        taskIds.push(task.id);
      } else {
        const { rows } = await client.query(
          `INSERT INTO tasks (user_id, date, text, done)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [user.id, date, task.text, task.done]
        );
        taskIds.push(rows[0].id);
      }
    }
    if (taskIds.length > 0) {
      await client.query(
        `DELETE FROM tasks
         WHERE user_id = $1 AND date = $2 AND NOT (id = ANY($3::uuid[]))`,
        [user.id, date, taskIds]
      );
    } else {
      await client.query('DELETE FROM tasks WHERE user_id = $1 AND date = $2', [user.id, date]);
    }
  });

  return getPlanner(user, date);
};

export const carryOverTasks = async (userId, date) => {
  const nextDate = DateTime.fromISO(date, { zone: 'UTC' }).plus({ days: 1 }).toISODate();
  const { rowCount } = await query(
    `INSERT INTO tasks (user_id, date, carried_from_task_id, text, done, carried_over)
     SELECT source.user_id, $3, source.id, source.text, false, true
     FROM tasks source
     WHERE source.user_id = $1 AND source.date = $2 AND source.done = false
     ON CONFLICT (user_id, date, carried_from_task_id)
       WHERE carried_from_task_id IS NOT NULL
     DO NOTHING`,
    [userId, date, nextDate]
  );
  return { carried: rowCount };
};