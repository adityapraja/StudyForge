import { z } from 'zod';

export const createFriendRequestSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
});

export const updateFriendRequestSchema = z.object({
  action: z.enum(['accept', 'decline']),
});

export const createBlockSchema = z.object({
  user_id: z.uuid(),
});

export const friendRequestParamsSchema = z.object({
  id: z.uuid(),
});

export const userParamsSchema = z.object({
  userId: z.uuid(),
});
