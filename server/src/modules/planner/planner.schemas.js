import { DateTime } from 'luxon';
import { z } from 'zod';

const uuidSchema = z.string().uuid();
const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((date) => DateTime.fromISO(date, { zone: 'UTC' }).isValid, 'Invalid calendar date');

const plannerGoalSchema = z.object({
  id: uuidSchema.optional(),
  text: z.string().trim().min(1).max(200),
  target_seconds: z.number().int().nonnegative(),
  subject_id: uuidSchema.nullable().optional(),
});

const plannerTaskSchema = z.object({
  id: uuidSchema.optional(),
  text: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});

const uniqueIds = (items, ctx, field) => {
  const ids = items.flatMap((item) => item.id ? [item.id] : []);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: 'IDs must be unique', path: [field] });
  }
};

export const plannerDateSchema = z.object({ date: dateSchema });

export const savePlannerSchema = z.object({
  goals: z.array(plannerGoalSchema).min(1),
  tasks: z.array(plannerTaskSchema),
  reflection: z.string().max(500).nullable().optional(),
}).superRefine((body, ctx) => {
  uniqueIds(body.goals, ctx, 'goals');
  uniqueIds(body.tasks, ctx, 'tasks');
});