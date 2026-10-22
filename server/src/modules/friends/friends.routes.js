import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { config } from '../../config.js';
import {
  blockUser,
  createFriendRequest,
  getBlockedUsers,
  getFriendRequests,
  getFriends,
  removeFriend,
  unblockUser,
  updateFriendRequest,
} from './friends.service.js';
import {
  createBlockSchema,
  createFriendRequestSchema,
  friendRequestParamsSchema,
  updateFriendRequestSchema,
  userParamsSchema,
} from './friends.schemas.js';

const router = Router();
const friendRequestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many friend requests. Please try again later.' },
  }),
});

router.use(authenticate);

router.post('/requests', friendRequestRateLimit, validate({ body: createFriendRequestSchema }), async (req, res, next) => {
  try {
    res.status(201).json(await createFriendRequest(req.user.id, req.body.username));
  } catch (error) {
    next(error);
  }
});

router.get('/requests', async (req, res, next) => {
  try {
    res.status(200).json(await getFriendRequests(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.patch('/requests/:id', validate({ params: friendRequestParamsSchema, body: updateFriendRequestSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await updateFriendRequest(req.user.id, req.params.id, req.body.action));
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    res.status(200).json(await getFriends(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', validate({ params: friendRequestParamsSchema }), async (req, res, next) => {
  try {
    await removeFriend(req.user.id, req.params.id);
    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export const blocksRoutes = Router();
blocksRoutes.use(authenticate);

blocksRoutes.post('/', validate({ body: createBlockSchema }), async (req, res, next) => {
  try {
    await blockUser(req.user.id, req.body.user_id);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

blocksRoutes.get('/', async (req, res, next) => {
  try {
    res.status(200).json(await getBlockedUsers(req.user.id));
  } catch (error) {
    next(error);
  }
});

blocksRoutes.delete('/:userId', validate({ params: userParamsSchema }), async (req, res, next) => {
  try {
    await unblockUser(req.user.id, req.params.userId);
    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
