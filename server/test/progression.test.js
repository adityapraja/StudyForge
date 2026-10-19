import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, cleanDb, createTestUser, getTestPool } from './test-helper.js';
import { getXpBreakdown, calculateSessionXp } from '../src/modules/progression/xp.service.js';
import { updateStreakOnSessionEnd, getStreakInfo } from '../src/modules/progression/streak.service.js';

describe('Progression Rules (XP & Streaks)', () => {
  beforeAll(async () => {
    await setupTestDb();
    createApp();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  describe('XP and Level Calculation', () => {
    it('calculates level, xp_in_level, and xp_for_next_level correctly', () => {
      // Level 1: 0 - 199
      expect(getXpBreakdown(0)).toEqual({
        xp: 0,
        level: 1,
        xp_in_level: 0,
        xp_for_next_level: 200,
      });

      // Level 2: 200 - 449
      expect(getXpBreakdown(200)).toEqual({
        xp: 200,
        level: 2,
        xp_in_level: 0,
        xp_for_next_level: 250,
      });

      // Level 5 example from API.md contract: 1240 XP -> Level 5, 140 in level, 400 for next
      expect(getXpBreakdown(1240)).toEqual({
        xp: 1240,
        level: 5,
        xp_in_level: 140,
        xp_for_next_level: 400,
      });
    });

    it('calculates session XP accurately with 4-hour cap', () => {
      expect(calculateSessionXp(1800, true)).toBe(30); // 30 minutes -> 30 XP
      expect(calculateSessionXp(1800, false)).toBe(0);  // Unverified -> 0 XP
      expect(calculateSessionXp(18000, true)).toBe(240); // 5 hours (300m) capped at 240 XP
    });
  });

  describe('Streak Calculation & Weekly Freeze', () => {
    it('does not extend streak if daily minutes is below minimum', async () => {
      const { user } = await createTestUser({ streak_minimum_minutes: 15 });
      const pool = getTestPool();
      const zone = user.time_zone;
      const today = DateTime.now().setZone(zone);

      // Seed 14 minutes today in daily_totals
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes) VALUES ($1, $2, 14, 14)`,
        [user.id, today.toISODate()]
      );

      const client = await pool.connect();
      try {
        const streak = await updateStreakOnSessionEnd(
          client,
          user.id,
          zone,
          15,
          today.toJSDate()
        );

        // Streak should still be 0
        expect(streak.current).toBe(0);
      } finally {
        client.release();
      }
    });

    it('extends streak when daily minutes reaches minimum', async () => {
      const { user } = await createTestUser({ streak_minimum_minutes: 15 });
      const pool = getTestPool();
      const zone = user.time_zone;
      const today = DateTime.now().setZone(zone);

      // Seed 15 minutes today
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes) VALUES ($1, $2, 15, 15)`,
        [user.id, today.toISODate()]
      );

      const client = await pool.connect();
      try {
        const streak = await updateStreakOnSessionEnd(
          client,
          user.id,
          zone,
          15,
          today.toJSDate()
        );

        // Streak increments to 1
        expect(streak.current).toBe(1);
        expect(streak.longest).toBe(1);
      } finally {
        client.release();
      }
    });

    it('applies weekly freeze automatically when exactly 1 day is missed', async () => {
      const { user } = await createTestUser({ streak_minimum_minutes: 15 });
      const pool = getTestPool();
      const zone = user.time_zone;

      // Suppose user had an existing 5-day streak ending 2 days ago (missed yesterday)
      const twoDaysAgo = DateTime.now().setZone(zone).minus({ days: 2 }).toISODate();
      const today = DateTime.now().setZone(zone);

      await pool.query(
        `UPDATE streaks
         SET current = 5, longest = 5, last_counted_date = $1, freeze_week = NULL
         WHERE user_id = $2`,
        [twoDaysAgo, user.id]
      );

      // User studies 20 minutes today
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes) VALUES ($1, $2, 20, 20)`,
        [user.id, today.toISODate()]
      );

      const client = await pool.connect();
      try {
        const streak = await updateStreakOnSessionEnd(
          client,
          user.id,
          zone,
          15,
          today.toJSDate()
        );

        // Streak preserved by freeze and extended: 5 -> 6!
        expect(streak.current).toBe(6);
        expect(streak.longest).toBe(6);

        // Verify freeze recorded
        const { rows } = await pool.query('SELECT freeze_week, freezes_used FROM streaks WHERE user_id = $1', [user.id]);
        expect(rows[0].freezes_used).toBe(1);
        expect(rows[0].freeze_week).toBe(today.toFormat("kkkk-'W'WW"));
      } finally {
        client.release();
      }
    });

    it('resets streak if freeze was already used this week', async () => {
      const { user } = await createTestUser({ streak_minimum_minutes: 15 });
      const pool = getTestPool();
      const zone = user.time_zone;

      const twoDaysAgo = DateTime.now().setZone(zone).minus({ days: 2 }).toISODate();
      const today = DateTime.now().setZone(zone);
      const currentWeek = today.toFormat("kkkk-'W'WW");

      // Freeze already used this week!
      await pool.query(
        `UPDATE streaks
         SET current = 5, longest = 10, last_counted_date = $1, freeze_week = $2, freezes_used = 1
         WHERE user_id = $3`,
        [twoDaysAgo, currentWeek, user.id]
      );

      // User studies 20 minutes today
      await pool.query(
        `INSERT INTO daily_totals (user_id, day, minutes, verified_minutes) VALUES ($1, $2, 20, 20)`,
        [user.id, today.toISODate()]
      );

      const client = await pool.connect();
      try {
        const streak = await updateStreakOnSessionEnd(
          client,
          user.id,
          zone,
          15,
          today.toJSDate()
        );

        // Streak reset to 1 because freeze was already consumed this week
        expect(streak.current).toBe(1);
        expect(streak.longest).toBe(10); // longest preserved
      } finally {
        client.release();
      }
    });
  });
});

