import { z } from 'zod';
import { timeZoneSchema } from '../auth/auth.schemas.js';

export const patchMeSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must contain only letters, numbers, and underscores')
    .optional(),
  time_zone: timeZoneSchema.optional(),
  category: z.enum(['school', 'college', 'competitive_exams', 'professional']).optional(),
  leaderboard_hidden: z.boolean().optional(),
  privacy: z
    .object({
      weekly_time: z.enum(['everyone', 'friends', 'nobody']).optional(),
      subjects: z.enum(['everyone', 'friends', 'nobody']).optional(),
    })
    .optional(),
});

export const updateGoalsSchema = z
  .object({
    daily_target_seconds: z
      .number()
      .int()
      .min(0, 'Daily target seconds must be non-negative')
      .optional(),
    weekly_target_seconds: z
      .number()
      .int()
      .min(0, 'Weekly target seconds must be non-negative')
      .optional(),
    streak_minimum_minutes: z
      .number()
      .int()
      .min(1, 'Streak minimum minutes must be at least 1')
      .optional(),
  })
  .refine(
    (data) =>
      data.daily_target_seconds !== undefined ||
      data.weekly_target_seconds !== undefined ||
      data.streak_minimum_minutes !== undefined,
    { message: 'At least one goal target or streak minimum must be provided' }
  );

export const xpEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
