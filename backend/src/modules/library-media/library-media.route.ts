import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { uploadSingleImage } from '../../middleware/upload.js';
import { requestMeta } from '../../utils/requestMeta.js';
import {
  libraryMediaParamSchema,
  libraryShotParamSchema,
  reorderLibraryShotsSchema,
} from './library-media.schemas.js';
import {
  deleteLibraryCover,
  deleteLibraryScreenshot,
  listLibraryMedia,
  reorderLibraryScreenshots,
  uploadLibraryCover,
  uploadLibraryScreenshot,
} from './library-media.service.js';

export function createLibraryMediaRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get('/:baseGameId/media', async (req, res) => {
    const { baseGameId } = libraryMediaParamSchema.parse(req.params);
    const data = await listLibraryMedia(baseGameId);

    res.json({ success: true, data });
  });

  router.post(
    '/:baseGameId/media/cover',
    requireRoles('SUPER_ADMIN'),
    uploadSingleImage,
    async (req, res) => {
      const { baseGameId } = libraryMediaParamSchema.parse(req.params);
      const data = await uploadLibraryCover(baseGameId, req.file, req.auth ?? null, requestMeta(req));

      res.status(201).json({ success: true, data });
    },
  );

  router.delete('/:baseGameId/media/cover', requireRoles('SUPER_ADMIN'), async (req, res) => {
    const { baseGameId } = libraryMediaParamSchema.parse(req.params);
    const data = await deleteLibraryCover(baseGameId, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  router.post(
    '/:baseGameId/media/screenshots',
    requireRoles('SUPER_ADMIN'),
    uploadSingleImage,
    async (req, res) => {
      const { baseGameId } = libraryMediaParamSchema.parse(req.params);
      const data = await uploadLibraryScreenshot(
        baseGameId,
        req.file,
        req.auth ?? null,
        requestMeta(req),
      );

      res.status(201).json({ success: true, data });
    },
  );

  router.delete(
    '/:baseGameId/media/screenshots/:mediaId',
    requireRoles('SUPER_ADMIN'),
    async (req, res) => {
      const { baseGameId, mediaId } = libraryShotParamSchema.parse(req.params);
      const data = await deleteLibraryScreenshot(
        baseGameId,
        mediaId,
        req.auth ?? null,
        requestMeta(req),
      );

      res.json({ success: true, data });
    },
  );

  router.patch(
    '/:baseGameId/media/screenshots/reorder',
    requireRoles('SUPER_ADMIN'),
    async (req, res) => {
      const { baseGameId } = libraryMediaParamSchema.parse(req.params);
      const body = reorderLibraryShotsSchema.parse(req.body);
      const data = await reorderLibraryScreenshots(baseGameId, body, req.auth ?? null, requestMeta(req));

      res.json({ success: true, data });
    },
  );

  return router;
}
