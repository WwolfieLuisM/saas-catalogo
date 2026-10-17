import { z } from 'zod';
import { slugSchema } from '../games/game.shared.js';

export const tenantPlatformsListQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export const tenantPlatformParamSchema = z.object({
  platformId: z.string().uuid(),
});

export const setPlatformEnabledSchema = z.object({
  enabled: z.boolean(),
});

export const createGlobalPlatformSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema,
  description: z.string().trim().max(500).nullish(),
});

export type TenantPlatformsListQuery = z.infer<typeof tenantPlatformsListQuerySchema>;
export type SetPlatformEnabledInput = z.infer<typeof setPlatformEnabledSchema>;
export type CreateGlobalPlatformInput = z.infer<typeof createGlobalPlatformSchema>;