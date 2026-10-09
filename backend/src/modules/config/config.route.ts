import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { requestMeta } from '../../utils/requestMeta.js';
import { configQuerySchema, updateConfigSchema } from './config.schemas.js';
import * as configService from './config.service.js';

export function createConfigRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'));

  router.get('/', async (req, res) => {
    const query = configQuerySchema.parse(req.query);
    const config = await configService.getConfig(req.auth ?? null, query);

    res.json({ success: true, data: config });
  });

  router.patch('/', async (req, res) => {
    const query = configQuerySchema.parse(req.query);
    const body = updateConfigSchema.parse(req.body);
    const config = await configService.updateConfig(
      req.auth ?? null,
      query,
      body,
      requestMeta(req),
    );

    res.json({ success: true, data: config });
  });

  return router;
}
