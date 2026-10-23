import { z } from 'zod';

export const createFriendRequestSchema = z.object({
  username: z.string().trim().min(3).max(20),
});

export const friendRequestParamsSchema = z.object({
  id: z.uuid(),
});

export const respondFriendRequestSchema = z.object({
  action: z.enum(['accept', 'decline']),
});

export const createBlockSchema = z.object({
  user_id: z.uuid(),
});

export const userIdParamsSchema = z.object({
  userId: z.uuid(),
});
