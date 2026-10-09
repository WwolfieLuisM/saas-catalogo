import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { buildMeta } from '../../utils/pagination.js';
import { requestMeta } from '../../utils/requestMeta.js';
import {
  backupIdParamSchema,
  backupListQuerySchema,
  createBackupSchema,
  restoreBackupSchema,
} from './backups.schemas.js';
import * as backupsService from './backups.service.js';

export function createBackupsRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'));

  router.get('/', async (req, res) => {
    const query = backupListQuerySchema.parse(req.query);
    const { items, total } = await backupsService.listBackups(req.auth ?? null, query);

    res.json({
      success: true,
      data: items.map(backupsService.backupDto),
      meta: buildMeta(total, query.page, query.limit),
    });
  });

  router.post('/', async (req, res) => {
    const body = createBackupSchema.parse(req.body ?? {});
    const backup = await backupsService.createBackup(req.auth ?? null, body, requestMeta(req));

    res.status(201).json({ success: true, data: backup });
  });

  router.post('/:id/restore', requireRoles('SUPER_ADMIN'), async (req, res) => {
    const { id } = backupIdParamSchema.parse(req.params);
    const body = restoreBackupSchema.parse(req.body);
    const backup = await backupsService.restoreBackup(id, body, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data: backup });
  });

  return router;
}
