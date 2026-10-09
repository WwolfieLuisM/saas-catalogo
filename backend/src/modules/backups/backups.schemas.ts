import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

export const backupListQuerySchema = paginationQuerySchema.extend({
  tenantId: z.string().uuid().optional(),
});

export type BackupListQuery = z.infer<typeof backupListQuerySchema>;

export const createBackupSchema = z.object({
  type: z.enum(['MANUAL', 'PRE_IMPORT', 'AUTOMATIC']).default('MANUAL'),
  tenantId: z.string().uuid().optional(),
});

export type CreateBackupInput = z.infer<typeof createBackupSchema>;

export const restoreBackupSchema = z.object({
  confirm: z.string().min(1),
});

export type RestoreBackupInput = z.infer<typeof restoreBackupSchema>;

export const backupIdParamSchema = z.object({
  id: z.string().uuid(),
});
