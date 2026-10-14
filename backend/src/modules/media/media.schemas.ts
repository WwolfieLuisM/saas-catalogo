import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

export const gameMediaParamSchema = z.object({
  gameId: z.string().uuid(),
});

export const screenshotParamSchema = z.object({
  gameId: z.string().uuid(),
  screenshotId: z.string().uuid(),
});

export const reorderScreenshotsSchema = z.object({
  order: z.array(z.string().uuid()).min(1).max(4),
});

export type ReorderScreenshotsInput = z.infer<typeof reorderScreenshotsSchema>;

export const mediaListQuerySchema = paginationQuerySchema.extend({
  tenantId: z.string().uuid().optional(),
  gameId: z.string().uuid().optional(),
  status: z.enum(['OK', 'PENDING', 'ERROR', 'ORPHAN']).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'sortOrder', '-sortOrder']).default('-createdAt'),
});

export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;

export const mediaScanQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export type MediaScanQuery = z.infer<typeof mediaScanQuerySchema>;

export const mediaAuditQuerySchema = paginationQuerySchema.extend({
  tenantId: z.string().uuid().optional(),
  provider: z.string().trim().max(50).optional(),
  hosting: z.enum(['cloudinary', 'external', 'unknown']).optional(),
  status: z.enum(['OK', 'PENDING', 'ERROR', 'ORPHAN']).optional(),
});

export type MediaAuditQuery = z.infer<typeof mediaAuditQuerySchema>;

export const mediaAuditCheckSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

export type MediaAuditCheckInput = z.infer<typeof mediaAuditCheckSchema>;
