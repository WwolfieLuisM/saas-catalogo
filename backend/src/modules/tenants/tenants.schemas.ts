import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

export const tenantListQuerySchema = paginationQuerySchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type TenantListQuery = z.infer<typeof tenantListQuerySchema>;

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido'),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    message: 'Debe indicar al menos un campo a actualizar',
  });

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const tenantIdParamSchema = z.object({
  id: z.string().uuid(),
});
