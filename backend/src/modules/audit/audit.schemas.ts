import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

export const auditListQuerySchema = paginationQuerySchema
  .extend({
    action: z.string().trim().min(1).max(64).optional(),
    entity: z.string().trim().min(1).max(64).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    tenantId: z.string().uuid().optional(),
  })
  .refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), {
    message: 'from no puede ser posterior a to',
    path: ['from'],
  });

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
