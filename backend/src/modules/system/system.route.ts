import { Router } from 'express';
import { getEnv } from '../../config/env.js';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { checkDatabaseHealth } from '../../utils/databaseHealth.js';

export function createSystemRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'));

  router.get('/', async (_req, res) => {
    const database = await checkDatabaseHealth();

    res.json({
      success: true,
      data: {
        status: database === 'ok' ? 'ok' : 'degraded',
        database,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        environment: getEnv().NODE_ENV,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
