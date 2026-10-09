import { z } from 'zod';
import {
  priceModeSchema,
  requirementsSchema,
  sizeUnitSchema,
  sizeValueSchema,
  slugSchema,
} from '../games/game.shared.js';

export const exportQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;

export const importBackupSchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export type ImportBackupInput = z.infer<typeof importBackupSchema>;

const refSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido');

export const importGameEntrySchema = z.strictObject({
  id: z.string().trim().min(1).max(64).optional(),
  title: z.string().trim().min(2).max(150),
  slug: slugSchema,
  description: z.string().trim().max(5000).nullish(),
  priceMode: priceModeSchema.optional(),
  price: z.number().positive().max(1000000000).nullish(),
  availability: z.boolean().optional(),
  sizeValue: sizeValueSchema,
  sizeUnit: sizeUnitSchema,
  releaseYear: z.number().int().min(1970).max(2100).nullish(),
  categorySlug: refSlugSchema.nullish(),
  genreSlugs: z.array(refSlugSchema).max(50).optional(),
  platformSlugs: z.array(refSlugSchema).max(50).optional(),
  baseGameSlug: refSlugSchema.nullish(),
  minimumRequirements: requirementsSchema.nullish(),
  recommendedRequirements: requirementsSchema.nullish(),
});

export type ImportGameEntry = z.infer<typeof importGameEntrySchema>;

export const validateImportSchema = z.object({
  tenantId: z.string().uuid().optional(),
  catalog: z.unknown(),
});

export type ValidateImportInput = z.infer<typeof validateImportSchema>;

export const runImportSchema = z.object({
  tenantId: z.string().uuid().optional(),
  catalog: z.unknown(),
  confirm: z.string().min(1),
  backupId: z.string().uuid(),
  fingerprint: z.string().trim().min(1).max(200),
});

export type RunImportInput = z.infer<typeof runImportSchema>;
