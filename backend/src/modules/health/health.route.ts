import { Router } from 'express';
import { getPrisma } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let database: 'ok' | 'error' = 'error';

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    database = 'ok';
  } catch (error) {
    logger.warn({ err: error }, 'database health check failed');
  }

  res.json({
    success: true,
    data: {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    },
  });
});
