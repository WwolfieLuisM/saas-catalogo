import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

export const sessionListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'revoked', 'all']).default('active'),
  tenantId: z.string().uuid().optional(),
});

export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;

export const sessionIdParamSchema = z.object({
  id: z.string().uuid(),
});
