import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../middleware/error-handler.js';
import { plannerDateSchema, savePlannerSchema } from './planner.schemas.js';
import { carryOverTasks, getPlanner, savePlanner } from './planner.service.js';

const router = Router();
router.use(authenticate);

router.get('/:date', validate({ params: plannerDateSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await getPlanner(req.user, req.params.date));
  } catch (error) {
    next(error);
  }
});

router.put('/:date', validate({ params: plannerDateSchema, body: savePlannerSchema }), async (req, res, next) => {
  if (req.body.goals.length > 3) {
    return next(new AppError(400, 'GOAL_LIMIT_REACHED', 'A daily plan can have no more than 3 goals.'));
  }
  try {
    res.status(200).json(await savePlanner(req.user, req.params.date, req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/:date/carry-over', validate({ params: plannerDateSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await carryOverTasks(req.user.id, req.params.date));
  } catch (error) {
    next(error);
  }
});

export default router;