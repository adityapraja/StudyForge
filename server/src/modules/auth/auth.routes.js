import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authRateLimiter } from '../../middleware/rate-limit.js';
import { config } from '../../config.js';
import { registerSchema, loginSchema } from './auth.schemas.js';
import { registerUser, loginUser } from './auth.service.js';

const router = Router();

const setAuthCookie = (res, token) => {
  const sameSite = process.env.COOKIE_SAME_SITE || 'lax';
  const secure = process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === 'true'
    : (config.isProduction || sameSite === 'none');

  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

router.post('/register', validate({ body: registerSchema }), async (req, res, next) => {
  try {
    const { user, token } = await registerUser(req.body);
    setAuthCookie(res, token);
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/login', authRateLimiter, validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const { user, token } = await loginUser(req.body);
    setAuthCookie(res, token);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  const sameSite = process.env.COOKIE_SAME_SITE || 'lax';
  const secure = process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === 'true'
    : (config.isProduction || sameSite === 'none');

  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure,
    sameSite,
  });
  res.status(200).json({ ok: true });
});

export default router;

