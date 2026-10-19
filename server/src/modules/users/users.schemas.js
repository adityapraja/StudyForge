import { z } from 'zod';

export const patchMeSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must contain only letters, numbers, and underscores')
    .optional(),
  time_zone: z.string().optional(),
  category: z.enum(['school', 'college', 'competitive_exams', 'professional']).optional(),
  leaderboard_hidden: z.boolean().optional(),
  privacy: z
    .object({
      weekly_time: z.enum(['everyone', 'friends', 'nobody']).optional(),
      subjects: z.enum(['everyone', 'friends', 'nobody']).optional(),
    })
    .optional(),
});

export const updateGoalsSchema = z.object({
  daily_target_seconds: z.number().int().min(0, 'Daily target seconds must be non-negative'),
  weekly_target_seconds: z.number().int().min(0, 'Weekly target seconds must be non-negative'),
  streak_minimum_minutes: z.number().int().min(1, 'Streak minimum minutes must be at least 1'),
});

