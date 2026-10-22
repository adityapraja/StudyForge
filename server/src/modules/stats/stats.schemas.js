import { z } from 'zod';

export const statsRangeSchema = z.object({
  range: z.enum(['week', 'month', 'year']).default('week'),
});

export const heatmapQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(9998).optional(),
});