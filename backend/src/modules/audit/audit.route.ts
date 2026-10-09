import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { buildMeta } from '../../utils/pagination.js';
import { auditListQuerySchema } from './audit.schemas.js';
import * as auditService from './audit.service.js';

export function createAuditRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'));

  router.get('/', async (req, res) => {
    const query = auditListQuerySchema.parse(req.query);
    const { items, total, actorUsernames } = await auditService.listAuditLogs(
      req.auth ?? null,
      query,
    );

    res.json({
      success: true,
      data: items.map((row) =>
        auditService.auditLogDto(
          row,
          row.actorId ? (actorUsernames.get(row.actorId) ?? null) : null,
        ),
      ),
      meta: buildMeta(total, query.page, query.limit),
    });
  });

  return router;
}
