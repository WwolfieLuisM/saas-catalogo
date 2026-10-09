import type { AddressInfo } from 'node:net';
import argon2 from 'argon2';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakeSession,
  addFakeTenant,
  addFakeUser,
  resetFakeDb,
  state,
} from '../helpers/fakeDb.js';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => fakeDb, closePrisma: async () => undefined };
});

interface ApiBody<T> {
  success: boolean;
  data?: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  error?: { code: string; message: string };
}

interface AdministratorData {
  id: string;
  username: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
  tenantId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
}

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;
let passwordHash: string;

const TENANT_JAVIER = '11111111-1111-4111-8111-111111111111';
const TENANT_OTRO = '22222222-2222-4222-8222-222222222222';
const USER_SUPER = '33333333-3333-4333-8333-333333333333';
const USER_SUPER2 = '44444444-4444-4444-8444-444444444444';
const USER_ADMIN = '55555555-5555-4555-8555-555555555555';

async function api<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
  token?: string,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = (await response.json()) as ApiBody<T>;

  return { status: response.status, body };
}

beforeAll(async () => {
  const { createApp } = await import('../../src/app.js');
  passwordHash = await argon2.hash('Sup3rSecret!Pass');
  server = createApp().listen(0);
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  superToken = await signAccessToken({ id: USER_SUPER, role: 'SUPER_ADMIN', tenantId: null });
  adminToken = await signAccessToken({
    id: USER_ADMIN,
    role: 'ADMIN',
    tenantId: TENANT_JAVIER,
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetFakeDb();
  addFakeTenant({ id: TENANT_JAVIER, name: 'Javier', slug: 'javier' });
  addFakeTenant({ id: TENANT_OTRO, name: 'Otro', slug: 'otro' });
  addFakeUser({
    id: USER_SUPER,
    username: 'root',
    passwordHash,
    role: 'SUPER_ADMIN',
    tenantId: null,
  });
  addFakeUser({
    id: USER_SUPER2,
    username: 'root2',
    passwordHash,
    role: 'SUPER_ADMIN',
    tenantId: null,
  });
  addFakeUser({
    id: USER_ADMIN,
    username: 'javier-admin',
    passwordHash,
    role: 'ADMIN',
    tenantId: TENANT_JAVIER,
  });
});

describe('GET /api/v1/admin/administrators', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api('/api/v1/admin/administrators');

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve 403 para role ADMIN', async () => {
    const { status, body } = await api('/api/v1/admin/administrators', {}, adminToken);

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('lista administradores con meta y sin passwordHash', async () => {
    const { status, body } = await api<AdministratorData[]>(
      '/api/v1/admin/administrators',
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 3, totalPages: 1 });
    expect(body.data).toHaveLength(3);
    expect(body.data?.[0]).not.toHaveProperty('passwordHash');
  });

  it('filtra por tenantId y q', async () => {
    const byTenant = await api<AdministratorData[]>(
      `/api/v1/admin/administrators?tenantId=${TENANT_JAVIER}`,
      {},
      superToken,
    );
    expect(byTenant.body.meta?.total).toBe(1);
    expect(byTenant.body.data?.[0]?.username).toBe('javier-admin');

    const byQuery = await api<AdministratorData[]>(
      '/api/v1/admin/administrators?q=ROOT',
      {},
      superToken,
    );
    expect(byQuery.body.meta?.total).toBe(2);
  });
});

describe('POST /api/v1/admin/administrators', () => {
  it('devuelve 403 para role ADMIN', async () => {
    const { status } = await api(
      '/api/v1/admin/administrators',
      {
        method: 'POST',
        body: JSON.stringify({
          username: 'nuevo',
          password: 'Password123',
          role: 'ADMIN',
          tenantId: TENANT_JAVIER,
        }),
      },
      adminToken,
    );

    expect(status).toBe(403);
  });

  it('crea ADMIN con hash argon2 y audita', async () => {
    const { status, body } = await api<AdministratorData>(
      '/api/v1/admin/administrators',
      {
        method: 'POST',
        body: JSON.stringify({
          username: 'nuevo-admin',
          password: 'Password123',
          role: 'ADMIN',
          tenantId: TENANT_JAVIER,
        }),
      },
      superToken,
    );

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      username: 'nuevo-admin',
      role: 'ADMIN',
      tenantId: TENANT_JAVIER,
      isActive: true,
    });
    expect(body.data).not.toHaveProperty('passwordHash');

    const stored = state.users.get(body.data?.id ?? '');
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(stored?.passwordHash ?? '', 'Password123')).resolves.toBe(true);

    const log = [...state.auditLogs.values()].find((row) => row.action === 'CREATE');
    expect(log).toMatchObject({
      entity: 'AdminUser',
      entityId: body.data?.id,
      actorId: USER_SUPER,
      tenantId: TENANT_JAVIER,
    });
  });

  it('devuelve 409 si el username ya existe', async () => {
    const { status, body } = await api(
      '/api/v1/admin/administrators',
      {
        method: 'POST',
        body: JSON.stringify({
          username: 'javier-admin',
          password: 'Password123',
          role: 'ADMIN',
          tenantId: TENANT_JAVIER,
        }),
      },
      superToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('USERNAME_TAKEN');
  });

  it('devuelve 400 si ADMIN no trae tenantId', async () => {
    const { status, body } = await api(
      '/api/v1/admin/administrators',
      {
        method: 'POST',
        body: JSON.stringify({ username: 'sin-tenant', password: 'Password123', role: 'ADMIN' }),
      },
      superToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si SUPER_ADMIN trae tenantId', async () => {
    const { status } = await api(
      '/api/v1/admin/administrators',
      {
        method: 'POST',
        body: JSON.stringify({
          username: 'super-con-tenant',
          password: 'Password123',
          role: 'SUPER_ADMIN',
          tenantId: TENANT_JAVIER,
        }),
      },
      superToken,
    );

    expect(status).toBe(400);
  });

  it('devuelve 400 si la password es corta', async () => {
    const { status } = await api(
      '/api/v1/admin/administrators',
      {
        method: 'POST',
        body: JSON.stringify({ username: 'corto-pass', password: 'abc', role: 'SUPER_ADMIN' }),
      },
      superToken,
    );

    expect(status).toBe(400);
  });

  it('devuelve 422 si el tenant no existe', async () => {
    const { status, body } = await api(
      '/api/v1/admin/administrators',
      {
        method: 'POST',
        body: JSON.stringify({
          username: 'tenant-fantasma',
          password: 'Password123',
          role: 'ADMIN',
          tenantId: '00000000-0000-4000-8000-000000000000',
        }),
      },
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('TENANT_NOT_FOUND');
  });
});

describe('GET /api/v1/admin/administrators/:id', () => {
  it('devuelve el administrador', async () => {
    const { status, body } = await api<AdministratorData>(
      `/api/v1/admin/administrators/${USER_ADMIN}`,
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: USER_ADMIN, role: 'ADMIN', tenantId: TENANT_JAVIER });
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  it('devuelve 404 si no existe', async () => {
    const { status, body } = await api(
      '/api/v1/admin/administrators/00000000-0000-4000-8000-000000000000',
      {},
      superToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('ADMINISTRATOR_NOT_FOUND');
  });
});

describe('PATCH /api/v1/admin/administrators/:id', () => {
  it('actualiza la password con hash argon2', async () => {
    const { status, body } = await api<AdministratorData>(
      `/api/v1/admin/administrators/${USER_ADMIN}`,
      { method: 'PATCH', body: JSON.stringify({ password: 'NuevaPass999' }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data?.username).toBe('javier-admin');

    const stored = state.users.get(USER_ADMIN);
    await expect(argon2.verify(stored?.passwordHash ?? '', 'NuevaPass999')).resolves.toBe(true);
    await expect(argon2.verify(stored?.passwordHash ?? '', 'Sup3rSecret!Pass')).resolves.toBe(
      false,
    );
  });

  it('cambia rol y asigna tenant', async () => {
    const { status, body } = await api<AdministratorData>(
      `/api/v1/admin/administrators/${USER_SUPER2}`,
      { method: 'PATCH', body: JSON.stringify({ role: 'ADMIN', tenantId: TENANT_OTRO }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ role: 'ADMIN', tenantId: TENANT_OTRO });

    const log = [...state.auditLogs.values()].find((row) => row.action === 'UPDATE');
    expect(log?.metadata).toMatchObject({ fields: ['role', 'tenantId'] });
  });

  it('devuelve 422 al pasar rol ADMIN sin tenant', async () => {
    const { status, body } = await api(
      `/api/v1/admin/administrators/${USER_SUPER2}`,
      { method: 'PATCH', body: JSON.stringify({ role: 'ADMIN' }) },
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('ROLE_TENANT_REQUIRED');
  });

  it('devuelve 409 al dar de baja al último SUPER_ADMIN activo', async () => {
    await api(
      `/api/v1/admin/administrators/${USER_SUPER2}`,
      { method: 'PATCH', body: JSON.stringify({ role: 'ADMIN', tenantId: TENANT_OTRO }) },
      superToken,
    );

    const { status, body } = await api(
      `/api/v1/admin/administrators/${USER_SUPER}`,
      { method: 'PATCH', body: JSON.stringify({ role: 'ADMIN', tenantId: TENANT_JAVIER }) },
      superToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('LAST_SUPER_ADMIN');
    expect(state.users.get(USER_SUPER)?.role).toBe('SUPER_ADMIN');
  });

  it('devuelve 400 sin campos', async () => {
    const { status } = await api(
      `/api/v1/admin/administrators/${USER_ADMIN}`,
      { method: 'PATCH', body: JSON.stringify({}) },
      superToken,
    );

    expect(status).toBe(400);
  });

  it('devuelve 404 si no existe', async () => {
    const { status } = await api(
      '/api/v1/admin/administrators/00000000-0000-4000-8000-000000000000',
      { method: 'PATCH', body: JSON.stringify({ isActive: false }) },
      superToken,
    );

    expect(status).toBe(404);
  });
});

describe('POST /api/v1/admin/administrators/:id/revoke-sessions', () => {
  it('revoca sesiones activas y audita', async () => {
    addFakeSession({ id: 's-1', adminId: USER_ADMIN, tokenHash: 'hash-1' });
    addFakeSession({ id: 's-2', adminId: USER_ADMIN, tokenHash: 'hash-2' });
    addFakeSession({
      id: 's-3',
      adminId: USER_ADMIN,
      tokenHash: 'hash-3',
      revokedAt: new Date(),
    });

    const { status, body } = await api<{ revoked: number }>(
      `/api/v1/admin/administrators/${USER_ADMIN}/revoke-sessions`,
      { method: 'POST' },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data?.revoked).toBe(2);
    expect([...state.sessions.values()].every((row) => row.revokedAt !== null)).toBe(true);

    const log = [...state.auditLogs.values()].find((row) => row.action === 'REVOKE_SESSIONS');
    expect(log).toMatchObject({ entity: 'AdminUser', entityId: USER_ADMIN, actorId: USER_SUPER });
  });

  it('devuelve 404 si el administrador no existe', async () => {
    const { status } = await api(
      '/api/v1/admin/administrators/00000000-0000-4000-8000-000000000000/revoke-sessions',
      { method: 'POST' },
      superToken,
    );

    expect(status).toBe(404);
  });

  it('invalida los access tokens vigentes del objetivo', async () => {
    const targetToken = await signAccessToken({
      id: USER_ADMIN,
      role: 'ADMIN',
      tenantId: TENANT_JAVIER,
    });

    const before = await api('/api/v1/auth/me', {}, targetToken);
    expect(before.status).toBe(200);

    const { status } = await api(
      `/api/v1/admin/administrators/${USER_ADMIN}/revoke-sessions`,
      { method: 'POST' },
      superToken,
    );
    expect(status).toBe(200);

    const after = await api('/api/v1/auth/me', {}, targetToken);
    expect(after.status).toBe(401);
    expect(after.body.error?.code).toBe('UNAUTHENTICATED');
  });
});

describe('cambio de password y sesiones', () => {
  it('revoca las sesiones activas del objetivo al cambiar la password', async () => {
    addFakeSession({ id: 's-p1', adminId: USER_ADMIN, tokenHash: 'hash-p1' });
    addFakeSession({ id: 's-p2', adminId: USER_ADMIN, tokenHash: 'hash-p2' });
    addFakeSession({
      id: 's-p3',
      adminId: USER_ADMIN,
      tokenHash: 'hash-p3',
      revokedAt: new Date(),
    });

    const { status } = await api(
      `/api/v1/admin/administrators/${USER_ADMIN}`,
      { method: 'PATCH', body: JSON.stringify({ password: 'NuevaPass!123' }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(state.sessions.get('s-p1')?.revokedAt).not.toBeNull();
    expect(state.sessions.get('s-p2')?.revokedAt).not.toBeNull();
    expect(state.sessions.get('s-p3')?.revokedAt).not.toBeNull();
  });

  it('no toca las sesiones cuando la password no cambia', async () => {
    addFakeSession({ id: 's-n1', adminId: USER_ADMIN, tokenHash: 'hash-n1' });

    const { status } = await api(
      `/api/v1/admin/administrators/${USER_ADMIN}`,
      { method: 'PATCH', body: JSON.stringify({ isActive: true }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(state.sessions.get('s-n1')?.revokedAt).toBeNull();
  });

  it('invalida los access tokens vigentes al cambiar la password', async () => {
    const targetToken = await signAccessToken({
      id: USER_ADMIN,
      role: 'ADMIN',
      tenantId: TENANT_JAVIER,
    });

    const before = await api('/api/v1/auth/me', {}, targetToken);
    expect(before.status).toBe(200);

    const changed = await api(
      `/api/v1/admin/administrators/${USER_ADMIN}`,
      { method: 'PATCH', body: JSON.stringify({ password: 'NuevaPass!123' }) },
      superToken,
    );
    expect(changed.status).toBe(200);

    const after = await api('/api/v1/auth/me', {}, targetToken);
    expect(after.status).toBe(401);
    expect(after.body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('no invalida los access tokens si la password no cambia', async () => {
    const targetToken = await signAccessToken({
      id: USER_ADMIN,
      role: 'ADMIN',
      tenantId: TENANT_JAVIER,
    });

    const { status } = await api(
      `/api/v1/admin/administrators/${USER_ADMIN}`,
      { method: 'PATCH', body: JSON.stringify({ isActive: true }) },
      superToken,
    );
    expect(status).toBe(200);

    const after = await api('/api/v1/auth/me', {}, targetToken);
    expect(after.status).toBe(200);
  });
});
