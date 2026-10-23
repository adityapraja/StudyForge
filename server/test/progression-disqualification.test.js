import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app.js';
import { query, withTransaction } from '../src/db.js';
import { disqualifySession, disqualifyUserDay } from '../src/modules/progression/disqualification.service.js';
import {
  auditSessionDiscrepancies,
  findConsecutiveHighVolumeDays,
  findUnrealisticEnduranceSessions,
  findSuspiciousDays,
  runNightlyAntiCheatAudit,
} from '../src/modules/progression/audit.service.js';
import { executeSessionEndTransaction } from '../src/modules/sessions/session-end.transaction.js';
import { awardTopicCompletionXp } from '../src/modules/progression/xp.service.js';
import {
  cleanDb,
  createTestSubject,
  createTestUser,
  getTestPool,
  setupTestDb,
  teardownTestDb,
} from './test-helper.js';

describe('Anti-cheat audit and confirmed disqualification', () => {
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

  const finishTimer = async (user, cookie, subject, minutes = 30) => {
    const started = await request(app)
      .post('/api/sessions/start')
      .set('Cookie', [cookie])
      .send({ subject_id: subject.id });
    expect(started.status).toBe(201);
    await getTestPool().query(
      `UPDATE sessions SET started_at = NOW() - ($2::integer * INTERVAL '1 minute')
       WHERE id = $1`,
      [started.body.id, minutes]
    );
    const ended = await request(app)
      .post(`/api/sessions/${started.body.id}/stop`)
      .set('Cookie', [cookie]);
    expect(ended.status).toBe(200);
    return started.body.id;
  };

  const confirmation = {
    confirmedBy: 'reviewer-1',
    confirmationReference: 'case-2026-42',
  };

  it('flags the configured saturation, high-volume, and manual-entry thresholds as review signals', async () => {
    const saturated = await createTestUser();
    const highVolume = await createTestUser();
    const manual = await createTestUser();
    const atManualLimit = await createTestUser();
    const day = DateTime.now().toISODate();
    const pool = getTestPool();
    await pool.query(
      `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
       VALUES ($1, $5, 960, 960), ($2, $5, 840, 840),
              ($3, $5, 481, 0), ($4, $5, 480, 0)`,
      [saturated.user.id, highVolume.user.id, manual.user.id, atManualLimit.user.id, day]
    );

    const results = await findSuspiciousDays();
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ user_id: saturated.user.id, flag: 'DAILY_CAP_SATURATION' }),
      expect.objectContaining({ user_id: highVolume.user.id, flag: 'HIGH_VOLUME_SUSPICIOUS' }),
      expect.objectContaining({
        user_id: manual.user.id,
        flag: 'EXCESSIVE_MANUAL_ENTRIES',
        manual_unverified_minutes: 481,
      }),
    ]));
    expect(results.some((row) => row.user_id === atManualLimit.user.id)).toBe(false);

    await runNightlyAntiCheatAudit();
    await runNightlyAntiCheatAudit();
    const { rows } = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM session_disqualifications
       WHERE user_id = ANY($1::uuid[])`,
      [[saturated.user.id, highVolume.user.id, manual.user.id]]
    );
    expect(rows[0].count).toBe(0);
  });

  it('reports configurable consecutive high-volume local dates without duplicating ranges', async () => {
    const consecutive = await createTestUser({ time_zone: 'Pacific/Kiritimati' });
    const gaps = await createTestUser({ time_zone: 'Pacific/Kiritimati' });
    const today = DateTime.now().setZone(consecutive.user.time_zone).startOf('day');
    expect(today.toISODate()).not.toBe(today.toUTC().toISODate());
    const pool = getTestPool();
    const values = [
      ...[-2, -1, 0].map((offset) => [
        consecutive.user.id,
        today.plus({ days: offset }).toISODate(),
        800,
      ]),
      ...[-4, -2].map((offset) => [
        gaps.user.id,
        today.plus({ days: offset }).toISODate(),
        800,
      ]),
    ];
    for (const [userId, day, minutes] of values) {
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
         VALUES ($1, $2, $3, $3)`,
        [userId, day, minutes]
      );
    }

    const findings = await findConsecutiveHighVolumeDays({
      thresholdMinutes: 800,
      consecutiveDays: 2,
    });
    expect(findings).toEqual([
      {
        user_id: consecutive.user.id,
        username: consecutive.user.username,
        start_day: today.minus({ days: 2 }).toISODate(),
        end_day: today.toISODate(),
        consecutive_days: 3,
        threshold_minutes: 800,
        flag: 'HIGH_VOLUME_CONSECUTIVE_DAYS',
      },
    ]);
    expect(await findConsecutiveHighVolumeDays({
      thresholdMinutes: 801,
      consecutiveDays: 2,
    })).toEqual([]);
    expect(await findConsecutiveHighVolumeDays({
      thresholdMinutes: 800,
      consecutiveDays: 4,
    })).toEqual([]);

    const report = await runNightlyAntiCheatAudit({
      thresholdMinutes: 800,
      consecutiveDays: 2,
    });
    expect(report.consecutive_high_volume_days).toEqual(findings);
    const { rows: disqualifications } = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM session_disqualifications
       WHERE user_id = ANY($1::uuid[])`,
      [[consecutive.user.id, gaps.user.id]]
    );
    expect(disqualifications[0].count).toBe(0);
  });

  it('reports session/daily-total drift over the one-minute tolerance without revoking credits', async () => {
    const { user } = await createTestUser();
    const subject = await createTestSubject(user.id);
    const pool = getTestPool();
    const { rows } = await pool.query(
      `INSERT INTO sessions
         (user_id, subject_id, started_at, ended_at, status, segment_started_at,
          study_seconds, source, verified)
       VALUES ($1, $2, NOW() - INTERVAL '1 hour', NOW(), 'ended', NOW(), 120, 'timer', true)
       RETURNING id`,
      [user.id, subject.id]
    );
    const drift = await auditSessionDiscrepancies({ toleranceMinutes: 1 });
    expect(drift).toEqual([
      expect.objectContaining({ user_id: user.id, delta_verified: 2, flag: 'DATA_DRIFT' }),
    ]);
    await runNightlyAntiCheatAudit();
    const { rows: sessionRows } = await pool.query(
      `SELECT verified, disqualified_at FROM sessions WHERE id = $1`,
      [rows[0].id]
    );
    expect(sessionRows[0]).toEqual({ verified: true, disqualified_at: null });
  });

  it('compares session drift using each user local date near UTC midnight', async () => {
    const timeZone = 'Pacific/Kiritimati';
    const { user } = await createTestUser({ time_zone: timeZone });
    const subject = await createTestSubject(user.id);
    const localToday = DateTime.now().setZone(timeZone).startOf('day');
    const startedAt = localToday.plus({ hours: 2 }).toUTC();
    expect(startedAt.toISODate()).not.toBe(localToday.toISODate());
    const pool = getTestPool();
    await pool.query(
      `INSERT INTO sessions
         (user_id, subject_id, started_at, ended_at, status, segment_started_at,
          study_seconds, source, verified)
       VALUES ($1, $2, $3, $4, 'ended', $3, 120, 'timer', true)`,
      [
        user.id,
        subject.id,
        startedAt.toJSDate(),
        startedAt.plus({ minutes: 2 }).toJSDate(),
      ]
    );
    await pool.query(
      `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes)
       VALUES ($1, $2, 2, 2)`,
      [user.id, localToday.toISODate()]
    );

    expect(await auditSessionDiscrepancies()).toEqual([]);
  });

  it('fails session finalization explicitly for an invalid stored time zone', async () => {
    const { user, cookie } = await createTestUser();
    const subject = await createTestSubject(user.id);
    const started = await request(app)
      .post('/api/sessions/start')
      .set('Cookie', [cookie])
      .send({ subject_id: subject.id });
    expect(started.status).toBe(201);
    const pool = getTestPool();
    await pool.query(
      `UPDATE users SET time_zone = 'Not/A_Real_Zone' WHERE id = $1`,
      [user.id]
    );

    const stopped = await request(app)
      .post(`/api/sessions/${started.body.id}/stop`)
      .set('Cookie', [cookie]);
    expect(stopped.status).toBe(500);
    expect(stopped.body.error.code).toBe('INVALID_STORED_TIME_ZONE');

    const { rows: sessions } = await pool.query(
      `SELECT status, ended_at FROM sessions WHERE id = $1`,
      [started.body.id]
    );
    expect(sessions[0]).toMatchObject({ status: 'running', ended_at: null });
    const { rows: totals } = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM daily_totals WHERE user_id = $1`,
      [user.id]
    );
    expect(totals[0].count).toBe(0);
    await pool.query(`UPDATE users SET time_zone = 'UTC' WHERE id = $1`, [user.id]);
  });

  it('flags six-hour uninterrupted timer sessions for review without automatic disqualification', async () => {
    const eligible = await createTestUser();
    const tooShort = await createTestUser();
    const paused = await createTestUser();
    const manual = await createTestUser();
    const pool = getTestPool();
    const users = [eligible, tooShort, paused, manual];
    const subjects = await Promise.all(
      users.map(({ user }) => createTestSubject(user.id))
    );
    await pool.query(
      `INSERT INTO sessions
         (user_id, subject_id, started_at, ended_at, status, segment_started_at,
          study_seconds, paused_seconds, break_seconds, source, verified)
       VALUES
         ($1, $2, NOW() - INTERVAL '6 hours', NOW(), 'ended', NOW(), 21600, 0, 0, 'timer', true),
         ($3, $4, NOW() - INTERVAL '5 hours 59 minutes', NOW(), 'ended', NOW(), 21540, 0, 0, 'timer', true),
         ($5, $6, NOW() - INTERVAL '7 hours', NOW(), 'ended', NOW(), 21599, 1, 0, 'timer', true),
         ($7, $8, NOW() - INTERVAL '7 hours', NOW(), 'ended', NOW(), 25200, 0, 0, 'manual', false)`,
      [
        eligible.user.id, subjects[0].id,
        tooShort.user.id, subjects[1].id,
        paused.user.id, subjects[2].id,
        manual.user.id, subjects[3].id,
      ]
    );

    const flagged = await findUnrealisticEnduranceSessions();
    expect(flagged).toEqual([
      expect.objectContaining({
        user_id: eligible.user.id,
        flag: 'UNREALISTIC_ENDURANCE',
      }),
    ]);
    const report = await runNightlyAntiCheatAudit();
    expect(report.unrealistic_endurance_sessions).toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: eligible.user.id })])
    );
    const { rows: disqualifications } = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM session_disqualifications
       WHERE user_id = ANY($1::uuid[])`,
      [users.map(({ user }) => user.id)]
    );
    expect(disqualifications[0].count).toBe(0);
  });

  it('revokes only the confirmed session and preserves another valid session on that day', async () => {
    const { user, cookie } = await createTestUser({ daily_target_seconds: 86400 });
    const subject = await createTestSubject(user.id);
    const invalidSessionId = await finishTimer(user, cookie, subject);
    const validSessionId = await finishTimer(user, cookie, subject);

    const concurrentResults = await Promise.all([
      disqualifySession({ sessionId: invalidSessionId, ...confirmation }),
      disqualifySession({ sessionId: invalidSessionId, ...confirmation }),
    ]);
    expect(concurrentResults.filter((result) => result.disqualified)).toHaveLength(1);
    expect(concurrentResults.filter((result) => result.already_disqualified)).toHaveLength(1);
    expect(concurrentResults.reduce((total, result) => total + result.xp_revoked, 0)).toBe(30);
    expect(await disqualifySession({ sessionId: invalidSessionId, ...confirmation })).toEqual({
      disqualified: false,
      already_disqualified: true,
      xp_revoked: 0,
    });

    const pool = getTestPool();
    const { rows: totals } = await pool.query(
      `SELECT minutes, verified_minutes FROM daily_totals WHERE user_id = $1`,
      [user.id]
    );
    expect(totals[0].minutes).toBe(60);
    expect(totals[0].verified_minutes).toBe(30);
    const { rows: subjectTotals } = await pool.query(
      `SELECT verified_minutes FROM subject_daily_totals
       WHERE user_id = $1 AND subject_id = $2`,
      [user.id, subject.id]
    );
    expect(subjectTotals[0].verified_minutes).toBe(30);
    const { rows: sessionRows } = await pool.query(
      `SELECT id, verified, disqualified_at, leaderboard_credited_seconds
       FROM sessions WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[invalidSessionId, validSessionId]]
    );
    expect(sessionRows.find((row) => row.id === invalidSessionId)).toMatchObject({
      verified: false,
      leaderboard_credited_seconds: 0,
    });
    expect(sessionRows.find((row) => row.id === validSessionId).leaderboard_credited_seconds).toBe(1800);
    const { rows: xp } = await pool.query(
      `SELECT xp FROM users WHERE id = $1`,
      [user.id]
    );
    expect(xp[0].xp).toBe(30);
    const { rows: events } = await pool.query(
      `SELECT session_id, reversed_at FROM xp_events
       WHERE user_id = $1 AND kind = 'session' ORDER BY session_id`,
      [user.id]
    );
    expect(events.find((event) => event.session_id === invalidSessionId).reversed_at).toBeInstanceOf(Date);
    expect(events.find((event) => event.session_id === validSessionId).reversed_at).toBeNull();

    const leaderboard = await request(app)
      .get('/api/leaderboards?period=day')
      .set('Cookie', [cookie]);
    expect(leaderboard.body.entries).toEqual([
      expect.objectContaining({ user_id: user.id, seconds: 1800 }),
    ]);
  });

  it('rolls back all revocation writes when XP accounting is inconsistent', async () => {
    const { user, cookie } = await createTestUser({ daily_target_seconds: 86400 });
    const subject = await createTestSubject(user.id);
    const sessionId = await finishTimer(user, cookie, subject, 20);
    const pool = getTestPool();
    await pool.query(`UPDATE users SET xp = 0 WHERE id = $1`, [user.id]);

    await expect(disqualifySession({ sessionId, ...confirmation })).rejects.toMatchObject({
      code: 'ACCOUNTING_MISMATCH',
    });
    const { rows: state } = await pool.query(
      `SELECT s.verified, s.disqualified_at, s.leaderboard_credited_seconds,
              dt.minutes, dt.verified_minutes, subject_totals.verified_minutes AS subject_verified,
              u.xp, e.reversed_at
       FROM sessions s
       JOIN daily_totals dt ON dt.user_id = s.user_id
       JOIN subject_daily_totals subject_totals
         ON subject_totals.user_id = s.user_id
        AND subject_totals.subject_id = s.subject_id
        AND subject_totals.day = dt.day
       JOIN users u ON u.id = s.user_id
       JOIN xp_events e ON e.session_id = s.id AND e.kind = 'session'
       WHERE s.id = $1`,
      [sessionId]
    );
    expect(state[0]).toMatchObject({
      verified: true,
      disqualified_at: null,
      leaderboard_credited_seconds: 1200,
      minutes: 20,
      verified_minutes: 20,
      subject_verified: 20,
      xp: 0,
      reversed_at: null,
    });
  });

  it('preserves an independent daily-goal award when a session is disqualified', async () => {
    const { user, cookie } = await createTestUser({ daily_target_seconds: 1800 });
    const subject = await createTestSubject(user.id);
    const sessionId = await finishTimer(user, cookie, subject, 30);

    const result = await disqualifySession({ sessionId, ...confirmation });
    expect(result.xp_revoked).toBe(30);

    const { rows } = await getTestPool().query(
      `SELECT u.xp, daily.amount, daily.reversed_at, session.reversed_at AS session_reversed_at
       FROM users u
       JOIN xp_events daily ON daily.user_id = u.id AND daily.kind = 'daily_goal'
       JOIN xp_events session ON session.session_id = $2 AND session.kind = 'session'
       WHERE u.id = $1`,
      [user.id, sessionId]
    );
    expect(rows[0]).toMatchObject({
      xp: 50,
      amount: 50,
      reversed_at: null,
    });
    expect(rows[0].session_reversed_at).toBeInstanceOf(Date);
  });

  it('revokes a confirmed user-day once and prevents credits and XP from being recreated', async () => {
    const { user, cookie } = await createTestUser({ daily_target_seconds: 86400 });
    const subject = await createTestSubject(user.id);
    await finishTimer(user, cookie, subject, 20);
    await finishTimer(user, cookie, subject, 20);
    const day = DateTime.now().setZone(user.time_zone).toISODate();
    const pool = getTestPool();

    const concurrentResults = await Promise.all([
      disqualifyUserDay({ userId: user.id, day, ...confirmation }),
      disqualifyUserDay({ userId: user.id, day, ...confirmation }),
    ]);
    expect(concurrentResults.filter((result) => result.disqualified)).toHaveLength(1);
    expect(concurrentResults.filter((result) => result.already_disqualified)).toHaveLength(1);
    expect(concurrentResults.reduce((total, result) => total + result.xp_revoked, 0)).toBe(40);
    expect(await disqualifyUserDay({ userId: user.id, day, ...confirmation })).toEqual({
      disqualified: false,
      already_disqualified: true,
      xp_revoked: 0,
    });
    const { rows: totals } = await pool.query(
      `SELECT minutes, verified_minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
      [user.id, day]
    );
    expect(totals[0]).toMatchObject({ minutes: 40, verified_minutes: 0 });
    const { rows: credits } = await pool.query(
      `SELECT SUM(leaderboard_credited_seconds)::integer AS seconds,
              COUNT(*) FILTER (WHERE disqualification_id IS NOT NULL)::integer AS revoked
       FROM session_day_credits WHERE user_id = $1 AND day = $2`,
      [user.id, day]
    );
    expect(credits[0]).toEqual({ seconds: 0, revoked: 2 });
    const { rows: xp } = await pool.query(`SELECT xp FROM users WHERE id = $1`, [user.id]);
    expect(xp[0].xp).toBe(0);
    const leaderboard = await request(app)
      .get('/api/leaderboards?period=day')
      .set('Cookie', [cookie]);
    expect(leaderboard.body.entries).toEqual([]);

    const subsequentSessionId = await finishTimer(user, cookie, subject, 10);
    const { rows: later } = await pool.query(
      `SELECT leaderboard_credited_seconds FROM sessions WHERE id = $1`,
      [subsequentSessionId]
    );
    expect(later[0].leaderboard_credited_seconds).toBe(0);
    const { rows: finalTotals } = await pool.query(
      `SELECT minutes, verified_minutes FROM daily_totals WHERE user_id = $1 AND day = $2`,
      [user.id, day]
    );
    expect(finalTotals[0]).toMatchObject({ minutes: 50, verified_minutes: 0 });
    const { rows: finalXp } = await pool.query(`SELECT xp FROM users WHERE id = $1`, [user.id]);
    expect(finalXp[0].xp).toBe(0);
  });

  it('revokes a cross-midnight user-day atomically while preserving the adjacent day and daily-goal XP', async () => {
    const { user, cookie } = await createTestUser({ daily_target_seconds: 1800 });
    const subject = await createTestSubject(user.id);
    const pool = getTestPool();
    const dayTwoStart = DateTime.utc().startOf('day').minus({ days: 1 });
    const startedAt = dayTwoStart.minus({ minutes: 30 }).toJSDate();
    const endedAt = dayTwoStart.plus({ minutes: 30 }).toJSDate();
    const { rows: sessionRows } = await pool.query(
      `INSERT INTO sessions
         (user_id, subject_id, started_at, segment_started_at, status, source, verified)
       VALUES ($1, $2, $3, $3, 'running', 'timer', true)
       RETURNING *`,
      [user.id, subject.id, startedAt]
    );
    await withTransaction((client) =>
      executeSessionEndTransaction(client, user, sessionRows[0], { endedAt })
    );
    const targetDay = dayTwoStart.minus({ days: 1 }).toISODate();
    const preservedDay = dayTwoStart.toISODate();
    await withTransaction((client) =>
      awardTopicCompletionXp(client, user.id, 'topic-cross-day', targetDay)
    );

    await expect(disqualifyUserDay({
      userId: user.id,
      day: targetDay,
      ...confirmation,
    })).resolves.toMatchObject({ disqualified: true, xp_revoked: 0 });

    const { rows: totals } = await pool.query(
      `SELECT day::text AS day, verified_minutes FROM daily_totals
       WHERE user_id = $1 ORDER BY day`,
      [user.id]
    );
    expect(totals).toEqual([
      { day: targetDay, verified_minutes: 0 },
      { day: preservedDay, verified_minutes: 30 },
    ]);
    expect((await auditSessionDiscrepancies()).filter(
      (finding) => finding.user_id === user.id
    )).toEqual([]);
    const { rows: credits } = await pool.query(
      `SELECT day::text AS day, leaderboard_credited_seconds, disqualification_id
       FROM session_day_credits WHERE user_id = $1 ORDER BY day`,
      [user.id]
    );
    expect(credits).toEqual([
      expect.objectContaining({ day: targetDay, leaderboard_credited_seconds: 0 }),
      expect.objectContaining({ day: preservedDay, leaderboard_credited_seconds: 1800, disqualification_id: null }),
    ]);
    const { rows: sessionCredits } = await pool.query(
      `SELECT leaderboard_credited_seconds FROM sessions WHERE user_id = $1`,
      [user.id]
    );
    expect(sessionCredits[0].leaderboard_credited_seconds).toBe(1800);
    const partialBoard = await request(app)
      .get('/api/leaderboards?period=day')
      .set('Cookie', [cookie]);
    expect(partialBoard.body.entries).toEqual([
      expect.objectContaining({ user_id: user.id, seconds: 1800 }),
    ]);
    const { rows: xp } = await pool.query(
      `SELECT u.xp, daily.reversed_at AS goal_reversed_at,
              session.reversed_at AS session_reversed_at,
              topic.reversed_at AS topic_reversed_at
       FROM users u
       JOIN xp_events daily ON daily.user_id = u.id AND daily.kind = 'daily_goal'
       JOIN xp_events session ON session.user_id = u.id AND session.kind = 'session'
       JOIN xp_events topic ON topic.user_id = u.id AND topic.kind = 'topic_done'
       WHERE u.id = $1`,
      [user.id]
    );
    expect(xp[0]).toMatchObject({
      xp: 130,
      goal_reversed_at: null,
      session_reversed_at: null,
      topic_reversed_at: null,
    });

    await expect(disqualifySession({
      sessionId: sessionRows[0].id,
      ...confirmation,
    })).resolves.toMatchObject({
      disqualified: true,
      already_disqualified: false,
      xp_revoked: 60,
    });
    const { rows: finalState } = await pool.query(
      `SELECT s.verified, s.leaderboard_credited_seconds,
              SUM(c.leaderboard_credited_seconds)::integer AS credited_seconds,
              SUM(dt.verified_minutes)::integer AS verified_minutes,
              u.xp
       FROM sessions s
       JOIN session_day_credits c ON c.session_id = s.id
       JOIN daily_totals dt ON dt.user_id = c.user_id AND dt.day = c.day
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1
       GROUP BY s.id, u.xp`,
      [sessionRows[0].id]
    );
    expect(finalState[0]).toEqual({
      verified: false,
      leaderboard_credited_seconds: 0,
      credited_seconds: 0,
      verified_minutes: 0,
      xp: 70,
    });
    const revokedBoard = await request(app)
      .get('/api/leaderboards?period=day')
      .set('Cookie', [cookie]);
    expect(revokedBoard.body.entries).toEqual([]);
  });

  it('rolls back user-day credits and totals if XP revocation fails', async () => {
    const { user, cookie } = await createTestUser({ daily_target_seconds: 86400 });
    const subject = await createTestSubject(user.id);
    await finishTimer(user, cookie, subject, 20);
    const day = DateTime.now().setZone(user.time_zone).toISODate();
    const pool = getTestPool();
    await pool.query(`UPDATE users SET xp = 0 WHERE id = $1`, [user.id]);

    await expect(disqualifyUserDay({
      userId: user.id,
      day,
      ...confirmation,
    })).rejects.toMatchObject({ code: 'ACCOUNTING_MISMATCH' });

    const { rows } = await pool.query(
      `SELECT dt.verified_minutes, c.verified_minutes AS credited_minutes,
              c.disqualification_id, c.revoked_at,
              subject_totals.verified_minutes AS subject_verified, u.xp, e.reversed_at
       FROM daily_totals dt
       JOIN session_day_credits c ON c.user_id = dt.user_id AND c.day = dt.day
       JOIN sessions s ON s.id = c.session_id
       JOIN subject_daily_totals subject_totals
         ON subject_totals.user_id = dt.user_id
        AND subject_totals.subject_id = s.subject_id
        AND subject_totals.day = dt.day
       JOIN users u ON u.id = dt.user_id
       JOIN xp_events e ON e.session_id = c.session_id AND e.kind = 'session'
       WHERE dt.user_id = $1 AND dt.day = $2`,
      [user.id, day]
    );
    expect(rows[0]).toMatchObject({
      verified_minutes: 20,
      credited_minutes: 20,
      disqualification_id: null,
      revoked_at: null,
      xp: 0,
      reversed_at: null,
    });
  });

  it('requires confirmation metadata and rejects unsupported legacy attribution', async () => {
    await expect(disqualifySession({ sessionId: 'not-a-uuid' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    const { user } = await createTestUser();
    const subject = await createTestSubject(user.id);
    const { rows } = await query(
      `INSERT INTO sessions
         (user_id, subject_id, started_at, ended_at, status, segment_started_at,
          study_seconds, source, verified, leaderboard_credited_seconds, leaderboard_credited_at)
       VALUES ($1, $2, NOW() - INTERVAL '1 hour', NOW(), 'ended', NOW(),
               1800, 'timer', true, 1800, NOW())
       RETURNING id`,
      [user.id, subject.id]
    );
    await expect(disqualifySession({ sessionId: rows[0].id, ...confirmation })).rejects.toMatchObject({
      code: 'UNSUPPORTED_HISTORICAL_CREDITS',
    });
  });
});
