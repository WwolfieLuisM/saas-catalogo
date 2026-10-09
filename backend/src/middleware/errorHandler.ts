import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/client.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';

interface BodyParserError {
  type?: string;
  statusCode?: number;
  status?: number;
}

const PRISMA_ERROR_MAP: Record<string, { statusCode: number; code: string; message: string }> = {
  P2002: { statusCode: 409, code: 'UNIQUE_CONFLICT', message: 'El registro ya existe' },
  P2003: { statusCode: 422, code: 'FOREIGN_KEY_VIOLATION', message: 'Referencia inválida' },
  P2025: { statusCode: 404, code: 'NOT_FOUND', message: 'Recurso no encontrado' },
};

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: error.issues,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_ERROR_MAP[error.code];

    if (mapped) {
      res.status(mapped.statusCode).json({
        success: false,
        error: {
          code: mapped.code,
          message: mapped.message,
          details: null,
        },
      });
      return;
    }
  }

  const bodyError = error as BodyParserError;

  if (bodyError.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body is not valid JSON',
        details: null,
      },
    });
    return;
  }

  const clientStatus = bodyError.statusCode ?? bodyError.status;

  if (typeof clientStatus === 'number' && clientStatus >= 400 && clientStatus < 500) {
    res.status(clientStatus).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Bad request',
        details: null,
      },
    });
    return;
  }

  logger.error({ err: error }, 'unhandled error');

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: null,
    },
  });
};
