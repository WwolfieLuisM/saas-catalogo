import { Router } from 'express';
import { checkDatabaseHealth } from '../../utils/databaseHealth.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const database = await checkDatabaseHealth();

  res.json({
    success: true,
    data: {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    },
  });
});
