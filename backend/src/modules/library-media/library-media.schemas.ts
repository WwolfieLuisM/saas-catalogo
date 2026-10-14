import { z } from 'zod';

export const libraryMediaParamSchema = z.object({
  baseGameId: z.string().uuid(),
});

export const libraryShotParamSchema = z.object({
  baseGameId: z.string().uuid(),
  mediaId: z.string().uuid(),
});

export const reorderLibraryShotsSchema = z.object({
  order: z.array(z.string().uuid()).min(1).max(4),
});

export type ReorderLibraryShotsInput = z.infer<typeof reorderLibraryShotsSchema>;
