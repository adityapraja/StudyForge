import { z } from 'zod';

export const leaderboardQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('week'),
  category: z.enum(['school', 'college', 'competitive_exams', 'professional']).optional(),
  scope: z.enum(['all', 'friends']).default('all'),
});
