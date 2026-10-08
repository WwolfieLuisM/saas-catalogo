import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido');

export const taxonomyListQuerySchema = paginationQuerySchema.extend({
  sort: z
    .enum(['name', '-name', 'createdAt', '-createdAt', 'updatedAt', '-updatedAt'])
    .default('-createdAt'),
  tenantId: z.string().uuid().optional(),
});

export type TaxonomyListQuery = z.infer<typeof taxonomyListQuerySchema>;

export const createTaxonomySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema,
  description: z.string().trim().max(500).nullish(),
  tenantId: z.string().uuid().optional(),
});

export type CreateTaxonomyInput = z.infer<typeof createTaxonomySchema>;

export const updateTaxonomySchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(500).nullish(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.slug !== undefined || value.description !== undefined,
    { message: 'Debe indicar al menos un campo a actualizar' },
  );

export type UpdateTaxonomyInput = z.infer<typeof updateTaxonomySchema>;

export const taxonomyIdParamSchema = z.object({
  id: z.string().uuid(),
});
