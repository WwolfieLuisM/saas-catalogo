import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import {
  priceModeSchema,
  requirementsSchema,
  sizeUnitSchema,
  sizeValueSchema,
  slugSchema,
  taxonomyIdsSchema,
} from './game.shared.js';

export const gamesListQuerySchema = paginationQuerySchema.extend({
  sort: z
    .enum([
      'title',
      '-title',
      'price',
      '-price',
      'releaseYear',
      '-releaseYear',
      'createdAt',
      '-createdAt',
      'updatedAt',
      '-updatedAt',
    ])
    .default('-createdAt'),
  tenantId: z.string().uuid().optional(),
  origin: z.enum(['BIBLIOTECA', 'PERSONALIZADO']).optional(),
  availability: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  categoryId: z.string().uuid().optional(),
});

export type GamesListQuery = z.infer<typeof gamesListQuerySchema>;

const libraryFieldKeys = [
  'title',
  'slug',
  'description',
  'sizeValue',
  'sizeUnit',
  'releaseYear',
  'minimumRequirements',
  'recommendedRequirements',
] as const;

export const createGameSchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    baseGameId: z.string().uuid().optional(),
    title: z.string().trim().min(2).max(150).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(5000).nullish(),
    priceMode: priceModeSchema.default('RULE'),
    price: z.number().positive().max(1000000000).optional(),
    availability: z.boolean().default(true),
    sizeValue: sizeValueSchema.optional(),
    sizeUnit: sizeUnitSchema.optional(),
    releaseYear: z.number().int().min(1970).max(2100).nullish(),
    categoryId: z.string().uuid().nullish(),
    genreIds: taxonomyIdsSchema.optional(),
    platformIds: taxonomyIdsSchema.optional(),
    minimumRequirements: requirementsSchema.optional(),
    recommendedRequirements: requirementsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.baseGameId) {
      const present = libraryFieldKeys.filter((key) => value[key] !== undefined);
      const firstKey = present[0];
      if (firstKey) {
        ctx.addIssue({
          code: 'custom',
          path: [firstKey],
          message: `No puedes enviar campos de biblioteca al publicar: ${present.join(', ')}`,
        });
      }
    } else {
      const missing = [
        value.title === undefined ? 'title' : null,
        value.slug === undefined ? 'slug' : null,
        value.sizeValue === undefined ? 'sizeValue' : null,
        value.sizeUnit === undefined ? 'sizeUnit' : null,
      ].filter((key): key is string => key !== null);

      if (missing.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['title'],
          message: `Campos obligatorios para juegos personalizados: ${missing.join(', ')}`,
        });
      }
    }

    if (value.priceMode === 'MANUAL' && value.price === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['price'],
        message: 'price es obligatorio cuando priceMode es MANUAL',
      });
    }

    if (value.priceMode === 'RULE' && value.price !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['price'],
        message: 'price solo aplica cuando priceMode es MANUAL',
      });
    }
  });

export type CreateGameInput = z.infer<typeof createGameSchema>;

export const updateGameSchema = z
  .object({
    title: z.string().trim().min(2).max(150).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(5000).nullish(),
    priceMode: priceModeSchema.optional(),
    price: z.number().positive().max(1000000000).optional(),
    availability: z.boolean().optional(),
    sizeValue: sizeValueSchema.optional(),
    sizeUnit: sizeUnitSchema.optional(),
    releaseYear: z.number().int().min(1970).max(2100).nullish(),
    categoryId: z.string().uuid().nullish(),
    genreIds: taxonomyIdsSchema.optional(),
    platformIds: taxonomyIdsSchema.optional(),
    minimumRequirements: requirementsSchema.optional(),
    recommendedRequirements: requirementsSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Debe indicar al menos un campo a actualizar',
  });

export type UpdateGameInput = z.infer<typeof updateGameSchema>;

export const gameIdParamSchema = z.object({
  id: z.string().uuid(),
});
