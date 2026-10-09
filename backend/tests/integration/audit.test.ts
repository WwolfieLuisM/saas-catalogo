import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import { addFakeAuditLog, addFakeTenant, addFakeUser, resetFakeDb } from '../helpers/fakeDb.js';

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

interface AuditLogView {
  id: string;
  timestamp: string;
  actorId: string | null;
  actorUsername: string | null;
  actorRole: string | null;
  tenantId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
}

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;

const TENANT_JAVIER = '11111111-1111-4111-8111-111111111111';
const TENANT_OTRO = '22222222-2222-4222-8222-222222222222';
const USER_SUPER = '33333333-3333-4333-8333-333333333333';
const USER_ADMIN = '55555555-5555-4555-8555-555555555555';
const USER_ADMIN_OTRO = '66666666-6666-4666-8666-666666666666';

const STABLE_TIME = new Date(Date.now() - 3 * 3600_000);

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
    role: 'SUPER_ADMIN',
    tenantId: null,
  });
  addFakeUser({
    id: USER_ADMIN,
    username: 'javier-admin',
    role: 'ADMIN',
    tenantId: TENANT_JAVIER,
  });
  addFakeUser({
    id: USER_ADMIN_OTRO,
    username: 'otro-admin',
    role: 'ADMIN',
    tenantId: TENANT_OTRO,
  });

  addFakeAuditLog({
    id: 'a1',
    action: 'CREATE',
    entity: 'AdminUser',
    tenantId: TENANT_JAVIER,
    actorId: USER_ADMIN,
    actorRole: 'ADMIN',
    timestamp: new Date(Date.now() - 3600_000),
    metadata: { fields: ['username'] },
    ipAddress: '127.0.0.1',
  });
  addFakeAuditLog({
    id: 'a2',
    action: 'UPDATE',
    entity: 'TenantGame',
    tenantId: TENANT_JAVIER,
    actorId: USER_ADMIN,
    timestamp: new Date(Date.now() - 48 * 3600_000),
  });
  addFakeAuditLog({
    id: 'a3',
    action: 'TENANT_CREATED',
    entity: 'Tenant',
    tenantId: null,
    actorId: USER_SUPER,
    actorRole: 'SUPER_ADMIN',
    timestamp: new Date(Date.now() - 2 * 3600_000),
  });
  addFakeAuditLog({
    id: 'a4',
    action: 'CREATE',
    entity: 'AdminUser',
    tenantId: TENANT_OTRO,
    actorId: USER_ADMIN_OTRO,
    timestamp: new Date(Date.now() - 1800_000),
  });
  addFakeAuditLog({
    id: 'a-same-1',
    action: 'LOGIN',
    entity: 'AdminUser',
    tenantId: TENANT_JAVIER,
    actorId: USER_ADMIN,
    timestamp: STABLE_TIME,
  });
  addFakeAuditLog({
    id: 'a-same-2',
    action: 'LOGIN',
    entity: 'AdminUser',
    tenantId: TENANT_JAVIER,
    actorId: USER_ADMIN,
    timestamp: STABLE_TIME,
  });
});

describe('GET /api/v1/admin/audit', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api('/api/v1/admin/audit');

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('ADMIN solo ve eventos de su tenant con actorUsername resuelto', async () => {
    const { status, body } = await api<AuditLogView[]>('/api/v1/admin/audit', {}, adminToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(4);
    expect(body.data?.map((item) => item.id).sort()).toEqual(['a-same-1', 'a-same-2', 'a1', 'a2']);
    expect(body.data?.find((item) => item.id === 'a1')?.actorUsername).toBe('javier-admin');
    expect(body.data?.find((item) => item.id === 'a1')?.metadata).toEqual({
      fields: ['username'],
    });
  });

  it('ADMIN con ?tenantId ajeno recibe 403 y con el propio 200', async () => {
    const ajeno = await api(`/api/v1/admin/audit?tenantId=${TENANT_OTRO}`, {}, adminToken);
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.error?.code).toBe('FORBIDDEN');

    const propio = await api(`/api/v1/admin/audit?tenantId=${TENANT_JAVIER}`, {}, adminToken);
    expect(propio.status).toBe(200);
    expect(propio.body.meta?.total).toBe(4);
  });

  it('SUPER_ADMIN lista el historial global incluyendo eventos de plataforma', async () => {
    const { status, body } = await api<AuditLogView[]>('/api/v1/admin/audit', {}, superToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(6);
    expect(body.data?.find((item) => item.id === 'a3')?.tenantId).toBeNull();
    expect(body.data?.find((item) => item.id === 'a3')?.actorUsername).toBe('root');
    expect(body.data?.find((item) => item.id === 'a4')?.actorUsername).toBe('otro-admin');
  });

  it('SUPER_ADMIN con ?tenantId filtra por ese tenant y 422 si no existe', async () => {
    const filtrado = await api(`/api/v1/admin/audit?tenantId=${TENANT_JAVIER}`, {}, superToken);
    expect(filtrado.status).toBe(200);
    expect(filtrado.body.meta?.total).toBe(4);

    const desconocido = await api(
      '/api/v1/admin/audit?tenantId=00000000-0000-4000-8000-000000000000',
      {},
      superToken,
    );
    expect(desconocido.status).toBe(422);
    expect(desconocido.body.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('filtra por action y por entity', async () => {
    const porAction = await api<AuditLogView[]>(
      '/api/v1/admin/audit?action=CREATE',
      {},
      superToken,
    );
    expect(porAction.status).toBe(200);
    expect(porAction.body.data?.map((item) => item.id).sort()).toEqual(['a1', 'a4']);

    const porEntity = await api<AuditLogView[]>(
      '/api/v1/admin/audit?entity=TenantGame',
      {},
      superToken,
    );
    expect(porEntity.status).toBe(200);
    expect(porEntity.body.data?.map((item) => item.id)).toEqual(['a2']);
  });

  it('q coincide también contra el username del actor', async () => {
    const { status, body } = await api<AuditLogView[]>(
      '/api/v1/admin/audit?q=javier',
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(4);
    expect(body.data?.every((item) => item.actorUsername === 'javier-admin')).toBe(true);
  });

  it('filtra por rango de fechas y valida from<=to', async () => {
    const desde = await api<AuditLogView[]>(
      `/api/v1/admin/audit?from=${new Date(Date.now() - 24 * 3600_000).toISOString()}`,
      {},
      superToken,
    );
    expect(desde.status).toBe(200);
    expect(desde.body.meta?.total).toBe(5);

    const hasta = await api<AuditLogView[]>(
      `/api/v1/admin/audit?to=${new Date(Date.now() - 24 * 3600_000).toISOString()}`,
      {},
      superToken,
    );
    expect(hasta.status).toBe(200);
    expect(hasta.body.meta?.total).toBe(1);
    expect(hasta.body.data?.map((item) => item.id)).toEqual(['a2']);

    const invertido = await api(
      `/api/v1/admin/audit?from=${new Date(Date.now() - 3600_000).toISOString()}&to=${new Date(
        Date.now() - 48 * 3600_000,
      ).toISOString()}`,
      {},
      superToken,
    );
    expect(invertido.status).toBe(400);
    expect(invertido.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si from/to no son fechas ISO válidas', async () => {
    const { status, body } = await api('/api/v1/admin/audit?from=no-fecha', {}, superToken);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('ordena por timestamp desc y desempata por id desc', async () => {
    const { status, body } = await api<AuditLogView[]>('/api/v1/admin/audit', {}, adminToken);

    expect(status).toBe(200);
    const ids = body.data?.map((item) => item.id) ?? [];
    expect(ids).toEqual(['a1', 'a-same-2', 'a-same-1', 'a2']);

    const timestamps = body.data?.map((item) => Date.parse(item.timestamp)) ?? [];
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
  });

  it('pagina con meta correcta', async () => {
    const { status, body } = await api<AuditLogView[]>(
      '/api/v1/admin/audit?limit=1&page=2',
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.meta).toEqual({ page: 2, pageSize: 1, total: 6, totalPages: 6 });
  });

  it('no expone secretos ni userAgent en los eventos', async () => {
    const { status, body } = await api<AuditLogView[]>('/api/v1/admin/audit', {}, superToken);

    expect(status).toBe(200);
    expect(JSON.stringify(body)).not.toMatch(
      /tokenHash|passwordHash|argon2|refresh_token|userAgent/,
    );
    expect(Object.keys(body.data?.[0] ?? {}).sort()).toEqual(
      [
        'id',
        'timestamp',
        'actorId',
        'actorUsername',
        'actorRole',
        'tenantId',
        'action',
        'entity',
        'entityId',
        'metadata',
        'ipAddress',
      ].sort(),
    );
  });

  it('no existen endpoints de escritura en la auditoría', async () => {
    const post = await api('/api/v1/admin/audit', { method: 'POST' }, superToken);
    expect(post.status).toBe(404);

    const patch = await api('/api/v1/admin/audit/a1', { method: 'PATCH' }, superToken);
    expect(patch.status).toBe(404);

    const remove = await api('/api/v1/admin/audit/a1', { method: 'DELETE' }, superToken);
    expect(remove.status).toBe(404);
  });
});
