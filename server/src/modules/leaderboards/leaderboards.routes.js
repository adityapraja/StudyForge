import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getLeaderboard } from '../friends/friends.service.js';
import { leaderboardQuerySchema } from './leaderboards.schemas.js';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: leaderboardQuerySchema }), async (req, res, next) => {
  try {
    const { period, scope } = req.query;
    const category = req.query.category || req.user.category;
    res.status(200).json(await getLeaderboard(req.user, { period, category, scope }));
  } catch (error) {
    next(error);
  }
});

export default router;
