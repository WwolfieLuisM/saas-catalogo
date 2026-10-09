import { z } from 'zod';

const tenantField = z.string().trim().min(1, 'tenant es obligatorio');

function refinePublicTenant(
  value: { tenant?: string; tenantId?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.tenantId !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['tenantId'],
      message: 'tenantId no está permitido; usa tenant con el slug',
    });
  }
  if (value.tenant === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['tenant'],
      message: 'tenant es obligatorio',
    });
  }
}

export const catalogQuerySchema = z
  .object({
    tenant: tenantField.optional(),
    tenantId: z.string().optional(),
  })
  .superRefine(refinePublicTenant);

export type CatalogQueryInput = z.infer<typeof catalogQuerySchema>;

export const catalogSyncQuerySchema = z
  .object({
    tenant: tenantField.optional(),
    tenantId: z.string().optional(),
    since: z.string().regex(/^\d+$/, 'since debe ser un número entero').optional(),
  })
  .superRefine(refinePublicTenant);

export type CatalogSyncQueryInput = z.infer<typeof catalogSyncQuerySchema>;
