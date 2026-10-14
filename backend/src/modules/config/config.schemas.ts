import { z } from 'zod';

export const configQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export type ConfigQuery = z.infer<typeof configQuerySchema>;

export const socialLinkSchema = z.object({
  label: z.string().trim().min(1).max(30),
  url: z.string().trim().url().max(300),
});

export const updateConfigSchema = z
  .object({
    publicName: z.string().trim().min(1).max(50).optional(),
    whatsapp: z.string().trim().max(30).optional(),
    footer: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(30).optional(),
    email: z.string().trim().max(120).optional(),
    logo: z.string().trim().max(300).optional(),
    socialLinks: z.array(socialLinkSchema).max(6).optional(),
    showUnavailable: z.boolean().optional(),
    offerOffline: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Debe indicar al menos un campo a actualizar',
  });

export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
