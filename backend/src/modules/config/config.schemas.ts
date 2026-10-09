import { z } from 'zod';

export const configQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export type ConfigQuery = z.infer<typeof configQuerySchema>;

export const updateConfigSchema = z
  .object({
    publicName: z.string().trim().min(1).max(50).optional(),
    whatsapp: z.string().trim().max(30).optional(),
    footer: z.string().trim().max(120).optional(),
    showUnavailable: z.boolean().optional(),
    offerOffline: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Debe indicar al menos un campo a actualizar',
  });

export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
