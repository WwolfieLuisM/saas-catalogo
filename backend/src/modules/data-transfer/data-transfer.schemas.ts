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

export const CATALOG_SCHEMA_V1 = 'luismi-platform/catalog@1';

export const CATALOG_SCHEMA = 'luismi-platform/catalog@2';

const clearableFields = [
  'title',
  'description',
  'sizeValue',
  'sizeUnit',
  'releaseYear',
  'categoryId',
  'minimumRequirements',
  'recommendedRequirements',
] as const;

const strictRequirements = z.strictObject({
  cpu: z.string().trim().max(150).optional(),
  gpu: z.string().trim().max(150).optional(),
  ram: z.string().trim().max(50).optional(),
  os: z.string().trim().max(100).optional(),
  directX: z.string().trim().max(50).optional(),
  storage: z.string().trim().max(100).optional(),
});

export const catalogOfferSchema = z.strictObject({
  baseGameSlug: slugSchema,
  platformSlug: refSlugSchema,
  slug: slugSchema.optional(),
  priceMode: priceModeSchema.optional(),
  price: z.number().positive().max(1000000000).nullish(),
  availability: z.boolean().optional(),
  title: z.string().trim().min(2).max(150).nullish(),
  description: z.string().trim().max(5000).nullish(),
  releaseYear: z.number().int().min(1970).max(2100).nullish(),
  sizeValue: sizeValueSchema.nullish(),
  sizeUnit: sizeUnitSchema.nullish(),
  minimumRequirements: strictRequirements.nullish(),
  recommendedRequirements: strictRequirements.nullish(),
  clearedFields: z.array(z.enum(clearableFields)).max(clearableFields.length).nullish(),
});

export type CatalogOffer = z.infer<typeof catalogOfferSchema>;

export const catalogImportSchema = z.strictObject({
  schema: z.string().trim().min(1),
  generatedAt: z.string().trim().optional(),
  source: z.string().trim().min(1).max(300).optional(),
  offers: z.array(z.unknown()).max(5000),
});

export type CatalogImport = z.infer<typeof catalogImportSchema>;

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
