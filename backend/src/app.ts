import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { healthRouter } from './modules/health/health.route.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1/health', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
