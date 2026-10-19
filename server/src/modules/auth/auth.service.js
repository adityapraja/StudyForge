import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { withTransaction, query } from '../../db.js';
import { config } from '../../config.js';
import { AppError } from '../../middleware/error-handler.js';

export const formatUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  time_zone: user.time_zone,
  category: user.category,
  leaderboard_hidden: user.leaderboard_hidden,
  privacy: typeof user.privacy === 'string' ? JSON.parse(user.privacy) : user.privacy,
  xp: user.xp,
  level: user.level,
  streak_minimum_minutes: user.streak_minimum_minutes,
});

export const registerUser = async ({ email, password, username, time_zone, category }) => {
  // Check email conflict
  const { rows: existingEmail } = await query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  if (existingEmail.length > 0) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  // Check username conflict
  const { rows: existingUsername } = await query(
    `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
    [username]
  );
  if (existingUsername.length > 0) {
    throw new AppError(409, 'USERNAME_TAKEN', 'This username is already taken');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user and streak in one transaction
  const user = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, username, time_zone, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, username, time_zone, category, leaderboard_hidden,
                 privacy, xp, level, streak_minimum_minutes`,
      [email, passwordHash, username, time_zone, category]
    );

    const newUser = rows[0];

    // Initialize streak row
    await client.query(
      `INSERT INTO streaks (user_id, current, longest, freezes_used)
       VALUES ($1, 0, 0, 0)`,
      [newUser.id]
    );

    return newUser;
  });

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  return { user: formatUser(user), token };
};

export const loginUser = async ({ email, password }) => {
  const { rows } = await query(
    `SELECT id, email, password_hash, username, time_zone, category, leaderboard_hidden,
            privacy, xp, level, streak_minimum_minutes
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  if (rows.length === 0) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const user = rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  return { user: formatUser(user), token };
};

