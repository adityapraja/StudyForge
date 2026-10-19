import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createSubjectSchema, patchSubjectSchema } from './subjects.schemas.js';
import {
  getUserSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
} from './subjects.service.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const subjects = await getUserSubjects(req.user.id);
    res.status(200).json(subjects);
  } catch (error) {
    next(error);
  }
});

router.post('/', validate({ body: createSubjectSchema }), async (req, res, next) => {
  try {
    const subject = await createSubject(req.user.id, req.body);
    res.status(201).json(subject);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', validate({ body: patchSubjectSchema }), async (req, res, next) => {
  try {
    const updated = await updateSubject(req.user.id, req.params.id, req.body);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteSubject(req.user.id, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

