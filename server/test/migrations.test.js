import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDb, query, closeDb } from '../src/db.js';
import { createTestSubject, createTestUser } from './test-helper.js';

describe('Database migrations', () => {
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

  it('runs the ordered migration runner repeatedly without errors', async () => {
    await initDb();
    await initDb();
    const { rows } = await query(
      `SELECT name FROM schema_migrations
       WHERE name = ANY($1::text[])
       ORDER BY name`,
      [[
        '001_planner_phase1.sql',
        '002_phase2_xp_bonuses.sql',
        '003_social_constraints.sql',
        '004_leaderboard_credits.sql',
        '005_anti_cheat_disqualification.sql',
      ]]
    );
    expect(rows.map((row) => row.name)).toEqual([
      '001_planner_phase1.sql',
      '002_phase2_xp_bonuses.sql',
      '003_social_constraints.sql',
      '004_leaderboard_credits.sql',
      '005_anti_cheat_disqualification.sql',
    ]);
  });

  it('applies the social constraints migration repeatably', async () => {
    const migrationPath = fileURLToPath(new URL('../migrations/003_social_constraints.sql', import.meta.url));
    const migrationSql = readFileSync(migrationPath, 'utf8');
    await query(migrationSql);
    await query(migrationSql);

    const { rows } = await query(
      `SELECT name FROM schema_migrations
       WHERE name = '003_social_constraints.sql'`
    );
    expect(rows).toHaveLength(1);

    const constraints = await query(
      `SELECT conname
       FROM pg_constraint
       WHERE conrelid IN ('public.friendships'::regclass, 'public.blocks'::regclass)
         AND conname = ANY($1::text[])`,
      [['friendships_not_self', 'blocks_not_self']]
    );
    expect(constraints.rows.map((row) => row.conname).sort()).toEqual([
      'blocks_not_self',
      'friendships_not_self',
    ]);
  });

  it('applies leaderboard credit columns and index repeatably without backfilling history', async () => {
    const migrationPath = fileURLToPath(new URL('../migrations/004_leaderboard_credits.sql', import.meta.url));
    const migrationSql = readFileSync(migrationPath, 'utf8');
    await query(migrationSql);
    await query(migrationSql);

    const columns = await query(
      `SELECT column_name, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'sessions'
         AND column_name = ANY($1::text[])`,
      [['leaderboard_credited_seconds', 'leaderboard_credited_at']]
    );
    expect(columns.rows).toHaveLength(2);
    expect(columns.rows.find((row) => row.column_name === 'leaderboard_credited_seconds')).toMatchObject({
      column_default: '0',
      is_nullable: 'NO',
    });

    const indexes = await query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'idx_sessions_leaderboard_credit'`
    );
    expect(indexes.rows).toHaveLength(1);

    const eligibilityConstraint = await query(
      `SELECT convalidated
       FROM pg_constraint
       WHERE conrelid = 'public.sessions'::regclass
         AND conname = 'sessions_leaderboard_credit_eligible'`
    );
    expect(eligibilityConstraint.rows).toEqual([{ convalidated: true }]);

    const { user } = await createTestUser();
    const subject = await createTestSubject(user.id);
    const { rows: legacyRows } = await query(
      `INSERT INTO sessions
         (user_id, subject_id, started_at, ended_at, status, segment_started_at,
          study_seconds, source, verified)
       VALUES ($1, $2, NOW() - INTERVAL '1 hour', NOW(), 'ended', NOW(), 3600, 'timer', true)
       RETURNING id, leaderboard_credited_seconds, leaderboard_credited_at`,
      [user.id, subject.id]
    );
    expect(legacyRows[0]).toMatchObject({
      leaderboard_credited_seconds: 0,
      leaderboard_credited_at: null,
    });

    await query(migrationSql);
    const { rows: unchangedRows } = await query(
      `SELECT leaderboard_credited_seconds, leaderboard_credited_at
       FROM sessions WHERE id = $1`,
      [legacyRows[0].id]
    );
    expect(unchangedRows[0]).toMatchObject({
      leaderboard_credited_seconds: 0,
      leaderboard_credited_at: null,
    });
  });

  it('applies anti-cheat disqualification attribution repeatably', async () => {
    const migrationPath = fileURLToPath(new URL('../migrations/005_anti_cheat_disqualification.sql', import.meta.url));
    const migrationSql = readFileSync(migrationPath, 'utf8');
    await query(migrationSql);
    await query(migrationSql);

    const tables = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [['session_disqualifications', 'session_day_credits']]
    );
    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      'session_day_credits',
      'session_disqualifications',
    ]);

    const xpColumns = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'xp_events'
         AND column_name = ANY($1::text[])`,
      [['reversed_at', 'disqualification_id']]
    );
    expect(xpColumns.rows.map((row) => row.column_name).sort()).toEqual([
      'disqualification_id',
      'reversed_at',
    ]);

    const foreignKeys = await query(
      `SELECT COUNT(*)::integer AS count
       FROM pg_constraint c
       JOIN pg_attribute a
         ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
       WHERE c.contype = 'f'
         AND c.conrelid = 'public.xp_events'::regclass
         AND c.confrelid = 'public.session_disqualifications'::regclass
         AND a.attname = 'disqualification_id'`
    );
    expect(foreignKeys.rows[0].count).toBe(1);
  });
});
