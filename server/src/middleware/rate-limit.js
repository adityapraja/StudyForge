import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const createRateLimiter = (max) => rateLimit({
  windowMs: 60 * 1000,
  max: config.nodeEnv === 'test' ? 1000 : max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please try again later.',
      },
    });
  },
});

export const authRateLimiter = createRateLimiter(6);
export const friendRequestRateLimiter = createRateLimiter(6);
