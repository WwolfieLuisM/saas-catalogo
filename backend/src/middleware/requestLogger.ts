import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();

  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      'request completed',
    );
  });

  next();
};
