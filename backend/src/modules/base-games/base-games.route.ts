import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { buildMeta } from '../../utils/pagination.js';
import { requestMeta } from '../../utils/requestMeta.js';
import {
  baseGameIdParamSchema,
  baseGamesListQuerySchema,
  createBaseGameSchema,
  updateBaseGameSchema,
} from './base-games.schemas.js';
import {
  createBaseGame,
  deleteBaseGame,
  getBaseGame,
  listBaseGames,
  restoreBaseGame,
  updateBaseGame,
} from './base-games.service.js';

export function createBaseGamesRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get('/', requireRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    const query = baseGamesListQuerySchema.parse(req.query);
    const { items, total } = await listBaseGames(query);

    res.json({
      success: true,
      data: items,
      meta: buildMeta(total, query.page, query.limit),
    });
  });

  router.post('/', requireRoles('SUPER_ADMIN'), async (req, res) => {
    const body = createBaseGameSchema.parse(req.body);
    const data = await createBaseGame(body, req.auth ?? null, requestMeta(req));

    res.status(201).json({ success: true, data });
  });

  router.get('/:id', requireRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    const { id } = baseGameIdParamSchema.parse(req.params);
    const data = await getBaseGame(id);

    res.json({ success: true, data });
  });

  router.patch('/:id', requireRoles('SUPER_ADMIN'), async (req, res) => {
    const { id } = baseGameIdParamSchema.parse(req.params);
    const body = updateBaseGameSchema.parse(req.body);
    const data = await updateBaseGame(id, body, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  router.delete('/:id', requireRoles('SUPER_ADMIN'), async (req, res) => {
    const { id } = baseGameIdParamSchema.parse(req.params);
    const data = await deleteBaseGame(id, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  router.post('/:id/restore', requireRoles('SUPER_ADMIN'), async (req, res) => {
    const { id } = baseGameIdParamSchema.parse(req.params);
    const data = await restoreBaseGame(id, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  return router;
}
