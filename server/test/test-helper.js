import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

let testPool = null;

const getConnectionString = () => {
  const connectionString =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://postgres@localhost:5433/tracker_test?host=/tmp/pgsockets'
  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error('Test database URL is invalid.');
  }

  if (
    target.hostname.toLowerCase() !== 'localhost'
    || !['5432', '5433'].includes(target.port || '5432')
    || target.pathname.replace(/^\/+/, '') !== 'tracker_test'
    || decodeURIComponent(target.username) !== 'postgres'
  ) {
    throw new Error('Tests may only connect to a local tracker_test database as postgres.');
  }

  return connectionString;
};

export const getTestPool = () => {
  if (!testPool) {
    testPool = new pg.Pool({ connectionString: getConnectionString() });
  }
  return testPool;
};

export const setupTestDb = async () => {
  return getTestPool();
};

export const cleanDb = async () => {
  const pool = getTestPool();
  await pool.query(
    `TRUNCATE users, subjects, sessions, daily_totals, streaks, xp_events CASCADE;`
  );
};

export const teardownTestDb = async () => {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
};

export const createTestUser = async (overrides = {}) => {
  const pool = getTestPool();
  const email =
    overrides.email ||
    `user_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
  const username =
    overrides.username ||
    `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const password = overrides.password || 'password123';
  const time_zone = overrides.time_zone || 'UTC';
  const category = overrides.category || 'college';
  const password_hash = await bcrypt.hash(password, 4);
  const dailyTarget = overrides.daily_target_seconds ?? 14400;
  const weeklyTarget = overrides.weekly_target_seconds ?? 72000;

  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, username, time_zone, category, streak_minimum_minutes, daily_target_seconds, weekly_target_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, email, username, time_zone, category, leaderboard_hidden, privacy, xp, level, streak_minimum_minutes, daily_target_seconds, weekly_target_seconds`,
    [
      email,
      password_hash,
      username,
      time_zone,
      category,
      overrides.streak_minimum_minutes || 15,
      dailyTarget,
      weeklyTarget,
    ]
  );

  const user = rows[0];

  // Initialize streak
  await pool.query(
    `INSERT INTO streaks (user_id, current, longest, freezes_used)
     VALUES ($1, $2, $3, 0)`,
    [user.id, overrides.current_streak || 0, overrides.longest_streak || 0]
  );

  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || 'study-forge-development-secret-key-min-32-chars',
    { expiresIn: '7d' }
  );

  return {
    user,
    token,
    cookie: `token=${token}`,
    plainPassword: password,
  };
};

export const createTestSubject = async (userId, overrides = {}) => {
  const pool = getTestPool();
  const name = overrides.name || `Subject_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const color = overrides.color || '#4F8EF7';

  const { rows } = await pool.query(
    `INSERT INTO subjects (user_id, name, color)
     VALUES ($1, $2, $3)
     RETURNING id, name, color`,
    [userId, name, color]
  );

  return rows[0];
};
