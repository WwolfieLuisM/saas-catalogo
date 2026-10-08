import { z } from 'zod';

const sizeGbSchema = z.number().min(0).max(1000000);

const priceSchema = z.number().min(0).max(1000000000);

export const createPricingRuleSchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    minSize: sizeGbSchema,
    maxSize: sizeGbSchema.nullish(),
    price: priceSchema,
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.maxSize != null && value.maxSize <= value.minSize) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxSize'],
        message: 'maxSize debe ser mayor que minSize',
      });
    }
  });

export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = z
  .object({
    minSize: sizeGbSchema.optional(),
    maxSize: sizeGbSchema.nullish(),
    price: priceSchema.optional(),
    active: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!Object.values(value).some((field) => field !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Debe indicar al menos un campo a actualizar',
      });
      return;
    }
    if (value.minSize !== undefined && value.maxSize != null && value.maxSize <= value.minSize) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxSize'],
        message: 'maxSize debe ser mayor que minSize',
      });
    }
  });

export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;

export const pricingRuleIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const pricingTenantQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export const pricingActionSchema = z.object({
  tenantId: z.string().uuid().optional(),
});
