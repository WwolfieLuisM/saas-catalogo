import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { uploadSingleImage } from '../../middleware/upload.js';
import { buildMeta } from '../../utils/pagination.js';
import { requestMeta } from '../../utils/requestMeta.js';
import {
  deleteCover,
  deleteScreenshot,
  getMediaManifest,
  listMedia,
  reorderScreenshots,
  scanMedia,
  uploadCover,
  uploadScreenshot,
} from './media.service.js';
import {
  gameMediaParamSchema,
  mediaListQuerySchema,
  mediaScanQuerySchema,
  reorderScreenshotsSchema,
  screenshotParamSchema,
} from './media.schemas.js';

export function createGameMediaRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get('/:gameId/media/manifest', async (req, res) => {
    const { gameId } = gameMediaParamSchema.parse(req.params);
    const data = await getMediaManifest(gameId, req.auth ?? null);

    res.json({ success: true, data });
  });

  router.post('/:gameId/cover', uploadSingleImage, async (req, res) => {
    const { gameId } = gameMediaParamSchema.parse(req.params);
    const data = await uploadCover(gameId, req.file, req.auth ?? null, requestMeta(req));

    res.status(201).json({ success: true, data });
  });

  router.delete('/:gameId/cover', async (req, res) => {
    const { gameId } = gameMediaParamSchema.parse(req.params);
    const data = await deleteCover(gameId, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  router.post('/:gameId/screenshots', uploadSingleImage, async (req, res) => {
    const { gameId } = gameMediaParamSchema.parse(req.params);
    const data = await uploadScreenshot(gameId, req.file, req.auth ?? null, requestMeta(req));

    res.status(201).json({ success: true, data });
  });

  router.delete('/:gameId/screenshots/:screenshotId', async (req, res) => {
    const { gameId, screenshotId } = screenshotParamSchema.parse(req.params);
    const data = await deleteScreenshot(gameId, screenshotId, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  router.patch('/:gameId/screenshots/reorder', async (req, res) => {
    const { gameId } = gameMediaParamSchema.parse(req.params);
    const body = reorderScreenshotsSchema.parse(req.body);
    const data = await reorderScreenshots(gameId, body, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  return router;
}

export function createMediaRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get('/', async (req, res) => {
    const query = mediaListQuerySchema.parse(req.query);
    const { items, total } = await listMedia(query, req.auth ?? null);

    res.json({
      success: true,
      data: items,
      meta: buildMeta(total, query.page, query.limit),
    });
  });

  router.post('/scan', async (req, res) => {
    const query = mediaScanQuerySchema.parse(req.query);
    const data = await scanMedia(query, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  return router;
}
