import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { friendRequestRateLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import {
  createBlockSchema,
  createFriendRequestSchema,
  friendRequestParamsSchema,
  respondFriendRequestSchema,
  userIdParamsSchema,
} from './friends.schemas.js';
import {
  blockUser,
  createFriendRequest,
  getFriendRequests,
  getFriends,
  removeFriend,
  respondToFriendRequest,
  unblockUser,
} from './friends.service.js';

const router = Router();
router.use(authenticate);
const blocksRouter = Router();
blocksRouter.use(authenticate);

router.post('/requests', friendRequestRateLimiter, validate({ body: createFriendRequestSchema }), async (req, res, next) => {
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

router.patch('/requests/:id', validate({ params: friendRequestParamsSchema, body: respondFriendRequestSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await respondToFriendRequest(req.user.id, req.params.id, req.body.action));
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
    res.status(200).json(await removeFriend(req.user.id, req.params.id));
  } catch (error) {
    next(error);
  }
});

blocksRouter.post('/blocks', validate({ body: createBlockSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await blockUser(req.user.id, req.body.user_id));
  } catch (error) {
    next(error);
  }
});

blocksRouter.delete('/blocks/:userId', validate({ params: userIdParamsSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await unblockUser(req.user.id, req.params.userId));
  } catch (error) {
    next(error);
  }
});

export default router;
export { blocksRouter };
