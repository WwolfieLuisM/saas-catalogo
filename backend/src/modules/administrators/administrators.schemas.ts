import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const usernameField = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9._-]+$/, 'username inválido');

const passwordField = z.string().min(8).max(128);

export const administratorListQuerySchema = paginationQuerySchema.extend({
  tenantId: z.string().uuid().optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN']).optional(),
});

export type AdministratorListQuery = z.infer<typeof administratorListQuerySchema>;

export const createAdministratorSchema = z
  .object({
    username: usernameField,
    password: passwordField,
    role: z.enum(['SUPER_ADMIN', 'ADMIN']),
    tenantId: z.string().uuid().nullish(),
  })
  .refine((value) => value.role !== 'ADMIN' || Boolean(value.tenantId), {
    message: 'tenantId es obligatorio para role ADMIN',
    path: ['tenantId'],
  })
  .refine((value) => value.role !== 'SUPER_ADMIN' || !value.tenantId, {
    message: 'role SUPER_ADMIN no admite tenantId',
    path: ['tenantId'],
  });

export type CreateAdministratorInput = z.infer<typeof createAdministratorSchema>;

export const updateAdministratorSchema = z
  .object({
    username: usernameField.optional(),
    password: passwordField.optional(),
    role: z.enum(['SUPER_ADMIN', 'ADMIN']).optional(),
    tenantId: z.string().uuid().nullish(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.username !== undefined ||
      value.password !== undefined ||
      value.role !== undefined ||
      value.tenantId !== undefined ||
      value.isActive !== undefined,
    { message: 'Debe indicar al menos un campo a actualizar' },
  );

export type UpdateAdministratorInput = z.infer<typeof updateAdministratorSchema>;

export const administratorIdParamSchema = z.object({
  id: z.string().uuid(),
});
