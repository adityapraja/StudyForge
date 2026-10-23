import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { leaderboardQuerySchema } from './leaderboards.schemas.js';
import { getLeaderboard } from './leaderboards.service.js';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: leaderboardQuerySchema }), async (req, res, next) => {
  try {
    res.status(200).json(await getLeaderboard(req.user, req.query));
  } catch (error) {
    next(error);
  }
});

export default router;
