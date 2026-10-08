import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import {
  requirementsSchema,
  sizeUnitSchema,
  sizeValueSchema,
  slugSchema,
  taxonomyIdsSchema,
} from '../games/game.shared.js';

export const baseGamesListQuerySchema = paginationQuerySchema.extend({
  sort: z
    .enum([
      'title',
      '-title',
      'releaseYear',
      '-releaseYear',
      'createdAt',
      '-createdAt',
      'updatedAt',
      '-updatedAt',
    ])
    .default('-createdAt'),
  categoryId: z.string().uuid().optional(),
});

export type BaseGamesListQuery = z.infer<typeof baseGamesListQuerySchema>;

export const createBaseGameSchema = z.object({
  title: z.string().trim().min(2).max(150),
  slug: slugSchema,
  description: z.string().trim().max(5000).nullish(),
  sizeValue: sizeValueSchema,
  sizeUnit: sizeUnitSchema,
  releaseYear: z.number().int().min(1970).max(2100).nullish(),
  categoryId: z.string().uuid().nullish(),
  genreIds: taxonomyIdsSchema.optional(),
  platformIds: taxonomyIdsSchema.optional(),
  minimumRequirements: requirementsSchema.optional(),
  recommendedRequirements: requirementsSchema.optional(),
});

export type CreateBaseGameInput = z.infer<typeof createBaseGameSchema>;

export const updateBaseGameSchema = z
  .object({
    title: z.string().trim().min(2).max(150).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(5000).nullish(),
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

export type UpdateBaseGameInput = z.infer<typeof updateBaseGameSchema>;

export const baseGameIdParamSchema = z.object({
  id: z.string().uuid(),
});
