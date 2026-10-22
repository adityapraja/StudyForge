import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createExamSchema,
  examParamsSchema,
  patchExamSchema,
} from './exams.schemas.js';
import {
  createExam,
  deleteExam,
  getExams,
  updateExam,
} from './exams.service.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.status(200).json(await getExams(req.user.id, req.user.time_zone));
  } catch (error) {
    next(error);
  }
});

router.post('/', validate({ body: createExamSchema }), async (req, res, next) => {
  try {
    res.status(201).json(await createExam(req.user.id, req.body, req.user.time_zone));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', validate({ params: examParamsSchema, body: patchExamSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await updateExam(req.user.id, req.params.id, req.body, req.user.time_zone));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', validate({ params: examParamsSchema }), async (req, res, next) => {
  try {
    res.status(200).json(await deleteExam(req.user.id, req.params.id));
  } catch (error) {
    next(error);
  }
});

export default router;
