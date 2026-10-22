import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { heatmapQuerySchema, statsRangeSchema } from './stats.schemas.js';
import { getHeatmap, getInsights, getProgress, getSubjectStats } from './stats.service.js';

const router = Router();
router.use(authenticate);

router.get('/heatmap', validate({ query: heatmapQuerySchema }), async (req, res, next) => {
  try {
    res.status(200).json(await getHeatmap(req.user.id, req.user.time_zone, req.query.year));
  } catch (error) {
    next(error);
  }
});

router.get('/progress', validate({ query: statsRangeSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await getProgress(req.user.id, req.user.time_zone, req.query.range));
  } catch (error) {
    next(error);
  }
});

router.get('/subjects', validate({ query: statsRangeSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await getSubjectStats(req.user.id, req.user.time_zone, req.query.range));
  } catch (error) {
    next(error);
  }
});

router.get('/insights', async (req, res, next) => {
  try {
    res.status(200).json(await getInsights(req.user.id, req.user.time_zone));
  } catch (error) {
    next(error);
  }
});

export default router;