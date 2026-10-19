import { z } from 'zod';

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1, 'Name must be at least 1 character').max(40, 'Name must be at most 40 characters'),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex code like #4F8EF7'),
});

export const patchSubjectSchema = z.object({
  name: z.string().trim().min(1, 'Name must be at least 1 character').max(40, 'Name must be at most 40 characters').optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex code like #4F8EF7')
    .optional(),
});

