import { z } from 'zod';

export const startSessionSchema = z.object({
  subject_id: z.string().uuid('Subject ID must be a valid UUID'),
});

export const stopSessionSchema = z
  .object({
    note: z.string().max(200, 'Note must be at most 200 characters').optional().nullable(),
  })
  .optional()
  .default({});

export const manualSessionSchema = z.object({
  subject_id: z.string().uuid('Subject ID must be a valid UUID'),
  started_at: z.string().datetime({ message: 'started_at must be an ISO 8601 timestamp' }),
  ended_at: z.string().datetime({ message: 'ended_at must be an ISO 8601 timestamp' }),
  note: z.string().max(200, 'Note must be at most 200 characters').optional().nullable(),
});

export const listSessionsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
  q: z.string().optional(),
  subject_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

