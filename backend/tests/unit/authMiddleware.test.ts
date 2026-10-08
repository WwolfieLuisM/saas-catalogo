import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { requireRoles } from '../../src/middleware/auth.js';

function invoke(
  auth:
    | { id: string; username: string; role: 'SUPER_ADMIN' | 'ADMIN'; tenantId: string | null }
    | undefined,
) {
  let error: unknown = null;
  const req = { auth } as unknown as Request;
  const res = {} as Response;
  const next = (err?: unknown) => {
    if (err) error = err;
  };

  requireRoles('SUPER_ADMIN')(req, res, next as NextFunction);

  return error;
}

describe('requireRoles', () => {
  it('permite si el rol coincide', () => {
    const error = invoke({ id: 'u-1', username: 'root', role: 'SUPER_ADMIN', tenantId: null });

    expect(error).toBeNull();
  });

  it('devuelve 403 si el rol no está permitido', () => {
    const error = invoke({ id: 'u-2', username: 'admin', role: 'ADMIN', tenantId: 't-javier' });

    expect(error).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('devuelve 401 si no hay sesión autenticada', () => {
    const error = invoke(undefined);

    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
  });
});
