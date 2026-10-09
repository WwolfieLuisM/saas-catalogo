import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import { addFakeTenant, addFakeUser, resetFakeDb } from '../helpers/fakeDb.js';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => fakeDb, closePrisma: async () => undefined };
});

interface SystemData {
  status: string;
  database: string;
  uptimeSeconds: number;
  nodeVersion: string;
  environment: string;
  timestamp: string;
}

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;

const TENANT_JAVIER = '11111111-1111-4111-8111-111111111111';
const USER_SUPER = '33333333-3333-4333-8333-333333333333';
const USER_ADMIN = '55555555-5555-4555-8555-555555555555';

async function api<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
  token?: string,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
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
});

describe('GET /api/v1/admin/system', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api('/api/v1/admin/system');

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve los datos del sistema con exactamente los 6 campos', async () => {
    const { status, body } = await api<SystemData>('/api/v1/admin/system', {}, adminToken);

    expect(status).toBe(200);
    expect(Object.keys(body.data ?? {}).sort()).toEqual(
      ['status', 'database', 'uptimeSeconds', 'nodeVersion', 'environment', 'timestamp'].sort(),
    );
    expect(body.data?.status).toBe('ok');
    expect(body.data?.database).toBe('ok');
    expect(body.data?.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.data?.uptimeSeconds)).toBe(true);
    expect(body.data?.nodeVersion).toBe(process.version);
    expect(['development', 'test', 'production']).toContain(body.data?.environment);
    expect(Number.isNaN(Date.parse(body.data?.timestamp ?? ''))).toBe(false);
  });

  it('SUPER_ADMIN también puede consultar el estado', async () => {
    const { status, body } = await api<SystemData>('/api/v1/admin/system', {}, superToken);

    expect(status).toBe(200);
    expect(body.data?.status).toBe('ok');
    expect(body.data?.database).toBe('ok');
  });

  it('no expone secretos de conexión ni credenciales', async () => {
    const { status, body } = await api('/api/v1/admin/system', {}, superToken);

    expect(status).toBe(200);
    expect(JSON.stringify(body)).not.toMatch(
      /postgresql:|DATABASE_URL|password|secret|tokenHash|eyJ[A-Za-z0-9]/i,
    );
  });

  it('no existen endpoints de mutación en system', async () => {
    const post = await api('/api/v1/admin/system', { method: 'POST' }, superToken);
    expect(post.status).toBe(404);

    const remove = await api('/api/v1/admin/system', { method: 'DELETE' }, superToken);
    expect(remove.status).toBe(404);
  });
});
