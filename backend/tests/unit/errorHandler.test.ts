import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { AppError } from '../../src/utils/appError.js';

interface Captured {
  statusCode: number;
  body: unknown;
}

function invoke(error: unknown): Captured {
  const captured: Captured = { statusCode: 0, body: undefined };
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  };

  errorHandler(error, {} as Request, res as unknown as Response, (() => undefined) as NextFunction);

  return captured;
}

describe('errorHandler', () => {
  it('devuelve 404 con formato de error para AppError', () => {
    const result = invoke(new AppError(404, 'NOT_FOUND', 'Route not found'));

    expect(result.statusCode).toBe(404);
    expect(result.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found', details: null },
    });
  });

  it('devuelve 400 VALIDATION_ERROR para ZodError', () => {
    const parsed = z.object({ title: z.string() }).safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    const result = invoke(parsed.error);

    expect(result.statusCode).toBe(400);
    const body = result.body as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 INVALID_JSON para errores de parseo de body', () => {
    const result = invoke({ type: 'entity.parse.failed', statusCode: 400 });

    expect(result.statusCode).toBe(400);
    const body = result.body as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('devuelve 500 INTERNAL_ERROR sin filtrar detalles para errores desconocidos', () => {
    const result = invoke(new Error('secret internal detail'));

    expect(result.statusCode).toBe(500);
    expect(result.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: null },
    });
  });
});
