import { z } from 'zod';

const uuidSchema = z.uuid();

export const subjectParamsSchema = z.object({
  id: uuidSchema,
});

export const topicParamsSchema = z.object({
  id: uuidSchema,
});

export const createTopicSchema = z.object({
  subject_id: uuidSchema,
  parent_id: uuidSchema.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  position: z.number().int().min(0).optional(),
});

export const patchTopicSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['not_started', 'in_progress', 'done']).optional(),
  parent_id: uuidSchema.nullable().optional(),
  position: z.number().int().min(0).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one topic field must be provided',
});

export const importTopicsSchema = z.object({
  text: z.string().min(1).refine((value) => value.trim().length > 0, {
    message: 'Import text must contain at least one topic',
  }),
});
