import { z } from 'zod';
import { sizeUnitSchema, sizeValueSchema, slugSchema } from '../games/game.shared.js';

export const LIBRARY_IMPORT_SCHEMA = 'library-import@2';

const httpsUrlSchema = z
  .url('URL inválida')
  .refine(
    (value) => value.toLowerCase().startsWith('https://'),
    'La URL debe empezar por https://',
  );

const provenanceUrlSchema = z.url('URL inválida').max(2000);

const taxonomySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido');

const strictRequirementsSchema = z.strictObject({
  cpu: z.string().trim().max(150).optional(),
  gpu: z.string().trim().max(150).optional(),
  ram: z.string().trim().max(50).optional(),
  os: z.string().trim().max(100).optional(),
  directX: z.string().trim().max(50).optional(),
  storage: z.string().trim().max(100).optional(),
});

const provenanceSchema = z.strictObject({
  source: z.string().trim().min(1).max(50),
  sourceUrl: provenanceUrlSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  ingestedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha esperada en formato YYYY-MM-DD')
    .optional(),
  notes: z.string().trim().max(300).optional(),
});

const platformVariantSchema = z.strictObject({
  platformSlug: taxonomySlugSchema,
  sizeValue: sizeValueSchema.nullish(),
  sizeUnit: sizeUnitSchema.nullish(),
  minimumRequirements: strictRequirementsSchema.nullish(),
  recommendedRequirements: strictRequirementsSchema.nullish(),
  provenance: provenanceSchema.nullish(),
});

export type LibraryImportVariant = z.infer<typeof platformVariantSchema>;

export const libraryImportRecordSchema = z.strictObject({
  title: z.string().trim().min(2).max(150),
  slug: slugSchema,
  description: z.string().trim().max(5000).nullish(),
  releaseYear: z.number().int().min(1970).max(2100).nullish(),
  developer: z.string().trim().max(150).nullish(),
  publisher: z.string().trim().max(150).nullish(),
  keywords: z.string().trim().max(500).nullish(),
  categorySlug: taxonomySlugSchema.nullish(),
  genreSlugs: z.array(taxonomySlugSchema).max(50).nullish(),
  sizeValue: sizeValueSchema.nullish(),
  sizeUnit: sizeUnitSchema.nullish(),
  minimumRequirements: strictRequirementsSchema.nullish(),
  recommendedRequirements: strictRequirementsSchema.nullish(),
  coverUrl: httpsUrlSchema.nullish(),
  platformVariants: z.array(platformVariantSchema).min(1).max(20),
});

export type LibraryImportRecord = z.infer<typeof libraryImportRecordSchema>;

export const libraryImportEnvelopeSchema = z.strictObject({
  schema: z.string().trim().min(1),
  generatedAt: z.string().trim().optional(),
  source: z.string().trim().min(1).max(300).optional(),
  games: z.array(z.unknown()).max(5000),
});

export type LibraryImportEnvelope = z.infer<typeof libraryImportEnvelopeSchema>;

export const libraryImportRequestSchema = z.strictObject({
  envelope: libraryImportEnvelopeSchema,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/, 'Fingerprint de 64 caracteres hexadecimales'),
  stateFingerprint: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'Fingerprint de estado de 64 caracteres hexadecimales'),
});

export type LibraryImportRequest = z.infer<typeof libraryImportRequestSchema>;