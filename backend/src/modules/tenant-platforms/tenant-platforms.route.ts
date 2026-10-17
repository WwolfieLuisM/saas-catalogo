import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requestMeta } from '../../utils/requestMeta.js';
import {
  createGlobalPlatformSchema,
  setPlatformEnabledSchema,
  tenantPlatformParamSchema,
  tenantPlatformsListQuerySchema,
} from './tenant-platforms.schemas.js';
import {
  createGlobalPlatform,
  listGlobalPlatforms,
  setPlatformEnabled,
} from './tenant-platforms.service.js';

export function createTenantPlatformsRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get('/', async (req, res) => {
    const query = tenantPlatformsListQuerySchema.parse(req.query);
    const items = await listGlobalPlatforms(req.auth ?? null, query);

    res.json({ success: true, data: items });
  });

  router.post('/', async (req, res) => {
    const body = createGlobalPlatformSchema.parse(req.body);
    const item = await createGlobalPlatform(req.auth ?? null, body, requestMeta(req));

    res.status(201).json({ success: true, data: item });
  });

  router.patch('/:platformId', async (req, res) => {
    const { platformId } = tenantPlatformParamSchema.parse(req.params);
    const query = tenantPlatformsListQuerySchema.parse(req.query);
    const body = setPlatformEnabledSchema.parse(req.body);
    const item = await setPlatformEnabled(req.auth ?? null, platformId, body, requestMeta(req), query);

    res.json({ success: true, data: item });
  });

  return router;
}