import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { buildMeta } from '../../utils/pagination.js';
import { requestMeta } from '../../utils/requestMeta.js';
import {
  createGame,
  deleteGame,
  getGame,
  listGames,
  restoreGame,
  updateGame,
} from './games.service.js';
import {
  createGameSchema,
  gameIdParamSchema,
  gamesListQuerySchema,
  updateGameSchema,
} from './games.schemas.js';

export function createGamesRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get('/', async (req, res) => {
    const query = gamesListQuerySchema.parse(req.query);
    const { items, total } = await listGames(query, req.auth ?? null);

    res.json({
      success: true,
      data: items,
      meta: buildMeta(total, query.page, query.limit),
    });
  });

  router.post('/', async (req, res) => {
    const body = createGameSchema.parse(req.body);
    const data = await createGame(body, req.auth ?? null, requestMeta(req));

    res.status(201).json({ success: true, data });
  });

  router.get('/:id', async (req, res) => {
    const { id } = gameIdParamSchema.parse(req.params);
    const data = await getGame(id, req.auth ?? null);

    res.json({ success: true, data });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = gameIdParamSchema.parse(req.params);
    const body = updateGameSchema.parse(req.body);
    const data = await updateGame(id, body, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = gameIdParamSchema.parse(req.params);
    const data = await deleteGame(id, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  router.post('/:id/restore', async (req, res) => {
    const { id } = gameIdParamSchema.parse(req.params);
    const data = await restoreGame(id, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  return router;
}
