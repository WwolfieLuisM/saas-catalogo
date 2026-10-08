import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import { addFakeTenant, addFakeUser, resetFakeDb, state } from '../helpers/fakeDb.js';

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

interface TenantData {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;

const T_JAVIER = '11111111-1111-4111-8111-111111111111';

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
  server = createApp().listen(0);
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  superToken = await signAccessToken({ id: 'u-super', role: 'SUPER_ADMIN', tenantId: null });
  adminToken = await signAccessToken({
    id: 'u-admin',
    role: 'ADMIN',
    tenantId: T_JAVIER,
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetFakeDb();
  addFakeUser({ id: 'u-super', username: 'root', role: 'SUPER_ADMIN', tenantId: null });
  addFakeUser({
    id: 'u-admin',
    username: 'javier-admin',
    role: 'ADMIN',
    tenantId: T_JAVIER,
  });
  addFakeTenant({ id: T_JAVIER, name: 'Javier', slug: 'javier' });
});

describe('GET /api/v1/admin/tenants', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api('/api/v1/admin/tenants');

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve 403 para role ADMIN', async () => {
    const { status, body } = await api('/api/v1/admin/tenants', {}, adminToken);

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('lista tenants con formato meta', async () => {
    const { status, body } = await api('/api/v1/admin/tenants', {}, superToken);

    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(body.data?.[0]).toMatchObject({ id: T_JAVIER, slug: 'javier', isActive: true });
  });

  it('paginar respeta page y limit', async () => {
    addFakeTenant({ id: 't-2', name: 'Otro', slug: 'otro' });
    addFakeTenant({ id: 't-3', name: 'Tercero', slug: 'tercero' });

    const { status, body } = await api('/api/v1/admin/tenants?limit=2&page=2', {}, superToken);

    expect(status).toBe(200);
    expect(body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(body.data).toHaveLength(1);
  });

  it('filtra q case-insensitive', async () => {
    addFakeTenant({ id: 't-2', name: 'Tienda Nova', slug: 'tienda-nova' });

    const { body } = await api('/api/v1/admin/tenants?q=TIENDA', {}, superToken);

    expect(body.meta?.total).toBe(1);
    expect(body.data?.[0]).toMatchObject({ slug: 'tienda-nova' });
  });

  it('filtra por isActive', async () => {
    addFakeTenant({ id: 't-2', name: 'Inactiva', slug: 'inactiva', isActive: false });

    const inactive = await api<TenantData[]>(
      '/api/v1/admin/tenants?isActive=false',
      {},
      superToken,
    );
    expect(inactive.body.meta?.total).toBe(1);
    expect(inactive.body.data?.[0]?.id).toBe('t-2');

    const active = await api<TenantData[]>('/api/v1/admin/tenants?isActive=true', {}, superToken);
    expect(active.body.meta?.total).toBe(1);
    expect(active.body.data?.[0]?.id).toBe(T_JAVIER);
  });
});

describe('POST /api/v1/admin/tenants', () => {
  it('devuelve 403 para role ADMIN', async () => {
    const { status } = await api(
      '/api/v1/admin/tenants',
      { method: 'POST', body: JSON.stringify({ name: 'Otro', slug: 'otro' }) },
      adminToken,
    );

    expect(status).toBe(403);
  });

  it('crea tenant, settings y registro de auditoría', async () => {
    const { status, body } = await api<TenantData>(
      '/api/v1/admin/tenants',
      { method: 'POST', body: JSON.stringify({ name: 'Tienda Nova', slug: 'tienda-nova' }) },
      superToken,
    );

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      name: 'Tienda Nova',
      slug: 'tienda-nova',
      isActive: true,
    });
    expect(body.data?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.tenants.size).toBe(2);

    const settings = [...state.tenantSettings.values()].find(
      (row) => row.tenantId === body.data?.id,
    );
    expect(settings).toBeDefined();

    const log = [...state.auditLogs.values()].find((row) => row.action === 'CREATE');
    expect(log).toMatchObject({
      entity: 'Tenant',
      entityId: body.data?.id,
      actorId: 'u-super',
      actorRole: 'SUPER_ADMIN',
      tenantId: body.data?.id,
    });
    expect(log?.ipAddress).toMatch(/127\.0\.0\.1/);
  });

  it('devuelve 409 si el slug ya existe', async () => {
    const { status, body } = await api(
      '/api/v1/admin/tenants',
      { method: 'POST', body: JSON.stringify({ name: 'Duplicado', slug: 'javier' }) },
      superToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('TENANT_SLUG_EXISTS');
  });

  it('devuelve 400 si el slug es inválido', async () => {
    const { status, body } = await api(
      '/api/v1/admin/tenants',
      { method: 'POST', body: JSON.stringify({ name: 'Slugs Malos', slug: 'Slug Invalido' }) },
      superToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si falta name', async () => {
    const { status } = await api(
      '/api/v1/admin/tenants',
      { method: 'POST', body: JSON.stringify({ slug: 'sin-nombre' }) },
      superToken,
    );

    expect(status).toBe(400);
  });
});

describe('GET /api/v1/admin/tenants/:id', () => {
  it('devuelve el tenant por id', async () => {
    const { status, body } = await api<TenantData>(
      `/api/v1/admin/tenants/${T_JAVIER}`,
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: T_JAVIER, name: 'Javier' });
  });

  it('devuelve 404 si no existe', async () => {
    const { status, body } = await api(
      '/api/v1/admin/tenants/00000000-0000-4000-8000-000000000000',
      {},
      superToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('devuelve 400 si el id no es un uuid', async () => {
    const { status } = await api('/api/v1/admin/tenants/no-es-uuid', {}, superToken);

    expect(status).toBe(400);
  });
});

describe('PATCH /api/v1/admin/tenants/:id', () => {
  it('actualiza name e isActive y audita', async () => {
    const { status, body } = await api<TenantData>(
      `/api/v1/admin/tenants/${T_JAVIER}`,
      { method: 'PATCH', body: JSON.stringify({ name: 'Javier Games', isActive: false }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ name: 'Javier Games', isActive: false });
    expect(state.tenants.get(T_JAVIER)?.isActive).toBe(false);

    const log = [...state.auditLogs.values()].find((row) => row.action === 'UPDATE');
    expect(log).toMatchObject({ entity: 'Tenant', entityId: T_JAVIER, actorId: 'u-super' });
    expect(log?.metadata).toMatchObject({ fields: ['name', 'isActive'] });
  });

  it('devuelve 400 sin campos', async () => {
    const { status } = await api(
      `/api/v1/admin/tenants/${T_JAVIER}`,
      { method: 'PATCH', body: JSON.stringify({}) },
      superToken,
    );

    expect(status).toBe(400);
  });

  it('devuelve 404 si el tenant no existe', async () => {
    const { status } = await api(
      '/api/v1/admin/tenants/00000000-0000-4000-8000-000000000000',
      { method: 'PATCH', body: JSON.stringify({ name: 'Otro' }) },
      superToken,
    );

    expect(status).toBe(404);
  });
});
