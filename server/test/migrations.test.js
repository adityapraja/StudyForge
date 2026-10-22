import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, query, closeDb } from '../src/db.js';

describe('Phase 1 database migration', () => {
  beforeAll(async () => {
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('records the planner migration and creates its required tables', async () => {
    await initDb();
    const { rows } = await query(
      `SELECT name FROM schema_migrations
       WHERE name = '001_planner_phase1.sql'`
    );
    expect(rows).toHaveLength(1);

    const tables = await query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [['planner_days', 'planner_goals', 'subject_daily_totals']]
    );
    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      'planner_days',
      'planner_goals',
      'subject_daily_totals',
    ]);
  });
});
