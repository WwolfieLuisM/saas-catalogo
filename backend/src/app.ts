import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { getEnv } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createAdministratorsRouter } from './modules/administrators/administrators.route.js';
import { createAuthRouter } from './modules/auth/auth.route.js';
import { healthRouter } from './modules/health/health.route.js';
import { createTenantsRouter } from './modules/tenants/tenants.route.js';
import {
  categoryTaxonomy,
  genreTaxonomy,
  platformTaxonomy,
} from './modules/taxonomy/taxonomy.config.js';
import { createTaxonomyRouter } from './modules/taxonomy/taxonomy.route.js';
import { AppError } from './utils/appError.js';

export function createApp() {
  const env = getEnv();
  const origins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const app = express();

  app.disable('x-powered-by');

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(cors({ origin: origins.includes('*') ? '*' : origins, credentials: true }));
  app.use(requestLogger);
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes, intenta más tarde'));
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/admin/tenants', createTenantsRouter());
  app.use('/api/v1/admin/administrators', createAdministratorsRouter());
  app.use('/api/v1/admin/categories', createTaxonomyRouter(categoryTaxonomy));
  app.use('/api/v1/admin/genres', createTaxonomyRouter(genreTaxonomy));
  app.use('/api/v1/admin/platforms', createTaxonomyRouter(platformTaxonomy));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
