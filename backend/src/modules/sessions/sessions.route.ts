import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { buildMeta } from '../../utils/pagination.js';
import { requestMeta } from '../../utils/requestMeta.js';
import { sessionIdParamSchema, sessionListQuerySchema } from './sessions.schemas.js';
import * as sessionsService from './sessions.service.js';

export function createSessionsRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'));

  router.get('/', async (req, res) => {
    const query = sessionListQuerySchema.parse(req.query);
    const { items, total } = await sessionsService.listSessions(req.auth ?? null, query);

    res.json({
      success: true,
      data: items,
      meta: buildMeta(total, query.page, query.limit),
    });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = sessionIdParamSchema.parse(req.params);
    const data = await sessionsService.revokeSession(id, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  return router;
}
