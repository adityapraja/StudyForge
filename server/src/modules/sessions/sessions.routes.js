import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  startSessionSchema,
  stopSessionSchema,
  manualSessionSchema,
  listSessionsQuerySchema,
} from './sessions.schemas.js';
import {
  startSession,
  getActiveSession,
  pauseSession,
  breakSession,
  resumeSession,
  stopSession,
  createManualSession,
  listSessions,
  deleteSession,
} from './sessions.service.js';

const router = Router();

router.use(authenticate);

router.post('/start', validate({ body: startSessionSchema }), async (req, res, next) => {
  try {
    const session = await startSession(req.user, req.body);
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.get('/active', async (req, res, next) => {
  try {
    const active = await getActiveSession(req.user.id);
    res.status(200).json(active);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    const session = await pauseSession(req.user.id, req.params.id);
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/break', async (req, res, next) => {
  try {
    const session = await breakSession(req.user.id, req.params.id);
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resume', async (req, res, next) => {
  try {
    const session = await resumeSession(req.user.id, req.params.id);
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/stop', validate({ body: stopSessionSchema }), async (req, res, next) => {
  try {
    const result = await stopSession(req.user, req.params.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/manual', validate({ body: manualSessionSchema }), async (req, res, next) => {
  try {
    const session = await createManualSession(req.user, req.body);
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.get('/', validate({ query: listSessionsQuerySchema }), async (req, res, next) => {
  try {
    const result = await listSessions(req.user, req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteSession(req.user.id, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

