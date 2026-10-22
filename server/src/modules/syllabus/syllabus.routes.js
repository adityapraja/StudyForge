import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createTopicSchema,
  importTopicsSchema,
  patchTopicSchema,
  subjectParamsSchema,
  topicParamsSchema,
} from './syllabus.schemas.js';
import {
  createTopic,
  deleteTopic,
  getSyllabus,
  importTopics,
  updateTopic,
} from './syllabus.service.js';

const router = Router();
router.use(authenticate);

router.get('/subjects/:id/syllabus', validate({ params: subjectParamsSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await getSyllabus(req.user.id, req.params.id));
  } catch (error) {
    next(error);
  }
});

router.post('/topics', validate({ body: createTopicSchema }), async (req, res, next) => {
  try {
    res.status(201).json(await createTopic(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
});

router.patch('/topics/:id', validate({ params: topicParamsSchema, body: patchTopicSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await updateTopic(req.user.id, req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/topics/:id', validate({ params: topicParamsSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await deleteTopic(req.user.id, req.params.id));
  } catch (error) {
    next(error);
  }
});

router.post('/subjects/:id/syllabus/import', validate({ params: subjectParamsSchema, body: importTopicsSchema }), async (req, res, next) => {
  try {
    res.status(201).json(await importTopics(req.user.id, req.params.id, req.body.text));
  } catch (error) {
    next(error);
  }
});

export default router;
