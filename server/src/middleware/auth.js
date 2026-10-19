import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { AppError } from './error-handler.js';

export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    if (req.cookies && req.cookies[config.cookieName]) {
      token = req.cookies[config.cookieName];
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
    }

    const { rows } = await query(
      `SELECT id, email, username, time_zone, category, leaderboard_hidden,
              privacy, xp, level, streak_minimum_minutes, daily_target_seconds,
              weekly_target_seconds
       FROM users
       WHERE id = $1`,
      [decoded.userId]
    );

    if (rows.length === 0) {
      throw new AppError(401, 'UNAUTHENTICATED', 'User not found');
    }

    req.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
};

