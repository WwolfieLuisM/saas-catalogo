import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken, signAccessToken } from '../../src/modules/auth/auth.tokens.js';
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

interface SessionView {
  id: string;
  adminId: string;
  adminUsername: string | null;
  adminRole: string | null;
  tenantId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  isCurrent: boolean;
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

const S1 = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S2 = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S3 = 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S4 = 'aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S5 = 'aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

  addFakeSession({
    id: S1,
    adminId: USER_ADMIN,
    tokenHash: hashToken('tok-1'),
    createdAt: new Date(Date.now() - 2 * 3600_000),
    userAgent: 'Chrome en Windows',
  });
  addFakeSession({
    id: S2,
    adminId: USER_ADMIN,
    tokenHash: hashToken('tok-2'),
    createdAt: new Date(Date.now() - 30 * 3600_000),
    userAgent: 'Chrome en Android',
  });
  addFakeSession({
    id: S3,
    adminId: USER_ADMIN,
    tokenHash: hashToken('tok-3'),
    revokedAt: new Date(),
    userAgent: 'Safari',
  });
  addFakeSession({
    id: S4,
    adminId: USER_ADMIN,
    tokenHash: hashToken('tok-4'),
    expiresAt: new Date(Date.now() - 3600_000),
    userAgent: 'Edge',
  });
  addFakeSession({
    id: S5,
    adminId: USER_ADMIN_OTRO,
    tokenHash: hashToken('tok-5'),
    userAgent: 'Firefox en Linux',
  });
});

describe('GET /api/v1/admin/sessions', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api('/api/v1/admin/sessions');

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('ADMIN solo ve sus sesiones activas con isCurrent en la más reciente', async () => {
    const { status, body } = await api<SessionView[]>('/api/v1/admin/sessions', {}, adminToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(2);
    expect(body.data?.map((item) => item.id)).toEqual([S1, S2]);
    expect(body.data?.find((item) => item.id === S1)?.isCurrent).toBe(true);
    expect(body.data?.find((item) => item.id === S2)?.isCurrent).toBe(false);
    expect(body.data?.every((item) => item.adminUsername === 'javier-admin')).toBe(true);
  });

  it('no expone tokenHash ni otros secretos', async () => {
    const { status, body } = await api<SessionView[]>('/api/v1/admin/sessions', {}, adminToken);

    expect(status).toBe(200);
    expect(JSON.stringify(body)).not.toMatch(/tokenHash|refresh_token|passwordHash/);
    expect(Object.keys(body.data?.[0] ?? {}).sort()).toEqual(
      [
        'id',
        'adminId',
        'adminUsername',
        'adminRole',
        'tenantId',
        'userAgent',
        'ipAddress',
        'createdAt',
        'lastUsedAt',
        'expiresAt',
        'revokedAt',
        'isCurrent',
      ].sort(),
    );
  });

  it('ADMIN con ?tenantId ajeno recibe 403 y con el propio 200', async () => {
    const ajeno = await api(`/api/v1/admin/sessions?tenantId=${TENANT_OTRO}`, {}, adminToken);
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.error?.code).toBe('FORBIDDEN');

    const propio = await api(`/api/v1/admin/sessions?tenantId=${TENANT_JAVIER}`, {}, adminToken);
    expect(propio.status).toBe(200);
    expect(propio.body.meta?.total).toBe(2);
  });

  it('SUPER_ADMIN lista activas globales incluyendo otros tenants', async () => {
    const { status, body } = await api<SessionView[]>('/api/v1/admin/sessions', {}, superToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(3);
    expect(body.data?.map((item) => item.id)).toEqual([S5, S1, S2]);
  });

  it('SUPER_ADMIN con ?tenantId filtra por ese tenant y 422 si no existe', async () => {
    const filtrado = await api<SessionView[]>(
      `/api/v1/admin/sessions?tenantId=${TENANT_JAVIER}`,
      {},
      superToken,
    );
    expect(filtrado.status).toBe(200);
    expect(filtrado.body.meta?.total).toBe(2);

    const desconocido = await api(
      '/api/v1/admin/sessions?tenantId=00000000-0000-4000-8000-000000000000',
      {},
      superToken,
    );
    expect(desconocido.status).toBe(422);
    expect(desconocido.body.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('filtra por status: revoked, all e inválido', async () => {
    const revocadas = await api<SessionView[]>(
      '/api/v1/admin/sessions?status=revoked',
      {},
      adminToken,
    );
    expect(revocadas.status).toBe(200);
    expect(revocadas.body.data?.map((item) => item.id)).toEqual([S3]);

    const todas = await api<SessionView[]>('/api/v1/admin/sessions?status=all', {}, adminToken);
    expect(todas.status).toBe(200);
    expect(todas.body.meta?.total).toBe(4);

    const invalida = await api('/api/v1/admin/sessions?status=inactiva', {}, adminToken);
    expect(invalida.status).toBe(400);
    expect(invalida.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('filtra por q sobre userAgent', async () => {
    const { status, body } = await api<SessionView[]>(
      '/api/v1/admin/sessions?q=Android',
      {},
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.map((item) => item.id)).toEqual([S2]);
  });

  it('pagina con orden estable y meta correcta', async () => {
    const { status, body } = await api<SessionView[]>(
      '/api/v1/admin/sessions?limit=1&page=2',
      {},
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.meta).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(body.data?.map((item) => item.id)).toEqual([S2]);
  });
});

describe('DELETE /api/v1/admin/sessions/:id', () => {
  it('devuelve 400 si el id no es un uuid', async () => {
    const { status, body } = await api(
      '/api/v1/admin/sessions/no-uuid',
      { method: 'DELETE' },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 404 si la sesión no existe o es de otro admin', async () => {
    const inexistente = await api(
      '/api/v1/admin/sessions/00000000-0000-4000-8000-000000000000',
      { method: 'DELETE' },
      adminToken,
    );
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error?.code).toBe('SESSION_NOT_FOUND');

    const ajena = await api('/api/v1/admin/sessions/' + S5, { method: 'DELETE' }, adminToken);
    expect(ajena.status).toBe(404);
    expect(ajena.body.error?.code).toBe('SESSION_NOT_FOUND');
  });

  it('devuelve 409 si la sesión ya está revocada', async () => {
    const { status, body } = await api(
      '/api/v1/admin/sessions/' + S3,
      { method: 'DELETE' },
      adminToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('SESSION_ALREADY_REVOKED');
  });

  it('revoca una sesión, audita SESSION_REVOKED y no expone secretos', async () => {
    const { status, body } = await api<SessionView>(
      '/api/v1/admin/sessions/' + S2,
      { method: 'DELETE' },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.id).toBe(S2);
    expect(body.data?.revokedAt).not.toBeNull();
    expect(body.data?.isCurrent).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/tokenHash/);

    const session = state.sessions.get(S2);
    expect(session?.revokedAt).not.toBeNull();

    const audit = [...state.auditLogs.values()].find((row) => row.action === 'SESSION_REVOKED');
    expect(audit).toBeDefined();
    expect(audit?.entity).toBe('AdminSession');
    expect(audit?.entityId).toBe(S2);
    expect(audit?.actorId).toBe(USER_ADMIN);
    expect(audit?.tenantId).toBe(TENANT_JAVIER);
  });

  it('SUPER_ADMIN puede revocar sesiones de cualquier admin y lo audita', async () => {
    const { status, body } = await api<SessionView>(
      '/api/v1/admin/sessions/' + S5,
      { method: 'DELETE' },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data?.id).toBe(S5);

    const audit = [...state.auditLogs.values()].find(
      (row) => row.action === 'SESSION_REVOKED' && row.entityId === S5,
    );
    expect(audit?.actorId).toBe(USER_SUPER);
  });

  it('al revocar la sesión actual el refresh queda invalidado y el access sigue vigente', async () => {
    const { status, body } = await api<SessionView>(
      '/api/v1/admin/sessions/' + S1,
      { method: 'DELETE' },
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.data?.isCurrent).toBe(true);

    const refresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: 'refresh_token=tok-1' },
    });
    const refreshBody = (await refresh.json()) as ApiBody<unknown>;
    expect(refresh.status).toBe(401);
    expect(refreshBody.error?.code).toBe('REFRESH_REUSE_DETECTED');

    const me = await api('/api/v1/auth/me', {}, adminToken);
    expect(me.status).toBe(200);
  });
});
