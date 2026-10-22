import { DateTime } from 'luxon';
import { z } from 'zod';

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((date) => DateTime.fromISO(date, { zone: 'UTC' }).isValid, 'Invalid calendar date');

const targetHoursSchema = z.number().min(0).max(9999.99).nullable();

export const examParamsSchema = z.object({ id: z.uuid() });

export const createExamSchema = z.object({
  subject_id: z.uuid(),
  date: dateSchema,
  target_hours: targetHoursSchema.optional(),
});

export const patchExamSchema = z.object({
  subject_id: z.uuid().optional(),
  date: dateSchema.optional(),
  target_hours: targetHoursSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one exam field must be provided',
});
