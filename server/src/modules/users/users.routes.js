import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { formatUser } from '../auth/auth.service.js';
import { getXpBreakdown, getUserXpEvents } from '../progression/xp.service.js';
import { getStreakInfo } from '../progression/streak.service.js';
import { patchMeSchema, updateGoalsSchema, xpEventsQuerySchema } from './users.schemas.js';
import {
  updateUserProfile,
  getUserGoalsWithProgress,
  getWeeklyGoalsBreakdown,
  updateUserGoals,
} from './users.service.js';
import { exportSessionsCsv } from '../export/export.service.js';

const router = Router();

// Protect all /me routes
router.use(authenticate);

router.get('/', (req, res) => {
  res.status(200).json(formatUser(req.user));
});

router.patch('/', validate({ body: patchMeSchema }), async (req, res, next) => {
  try {
    const updated = await updateUserProfile(req.user.id, req.body);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

router.get('/xp', (req, res) => {
  const xpData = getXpBreakdown(req.user.xp);
  res.status(200).json(xpData);
});

router.get('/xp/events', validate({ query: xpEventsQuerySchema }), async (req, res, next) => {
  try {
    const events = await getUserXpEvents(req.user.id, req.query);
    res.status(200).json(events);
  } catch (error) {
    next(error);
  }
});

router.get('/streak', async (req, res, next) => {
  try {
    const streakData = await getStreakInfo(
      req.user.id,
      req.user.time_zone,
      req.user.streak_minimum_minutes
    );
    res.status(200).json(streakData);
  } catch (error) {
    next(error);
  }
});

router.get('/goals', async (req, res, next) => {
  try {
    const goalsData = await getUserGoalsWithProgress(req.user);
    res.status(200).json(goalsData);
  } catch (error) {
    next(error);
  }
});

router.get('/goals/weekly', async (req, res, next) => {
  try {
    const weeklyData = await getWeeklyGoalsBreakdown(req.user);
    res.status(200).json(weeklyData);
  } catch (error) {
    next(error);
  }
});

router.get('/export.csv', async (req, res, next) => {
  try {
    const csv = await exportSessionsCsv(req.user.id, req.user.time_zone);
    res
      .status(200)
      .type('text/csv')
      .set('Content-Disposition', 'attachment; filename="study-sessions.csv"')
      .send(csv);
  } catch (error) {
    next(error);
  }
});

router.put('/goals', validate({ body: updateGoalsSchema }), async (req, res, next) => {
  try {
    const updated = await updateUserGoals(req.user.id, req.body);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
