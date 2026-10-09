import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakeTenant,
  addFakeTenantGame,
  addFakeTenantSettings,
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
  error?: { code: string; message: string };
}

interface ConfigDto {
  tenantId: string;
  publicName: string | null;
  whatsapp: string;
  footer: string;
  showUnavailable: boolean;
  offerOffline: boolean;
  updatedAt: string | null;
}

interface VersionDto {
  version: number;
}

const CONFIG = '/api/v1/admin/config';
const CATALOG = '/api/v1/catalog';
const T_JAVIER = '11111111-1111-4111-8111-111111111111';
const T_OTRO = '22222222-2222-4222-8222-222222222222';

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;

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

async function getConfig(token?: string, query = ''): Promise<ConfigDto> {
  const { status, body } = await api<ConfigDto>(`${CONFIG}${query}`, {}, token);
  expect(status).toBe(200);
  return body.data as ConfigDto;
}

async function catalogVersion(): Promise<number> {
  const { body } = await api<VersionDto>(`${CATALOG}/version?tenant=javier`);
  return (body.data as VersionDto).version;
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
  adminToken = await signAccessToken({ id: 'u-admin', role: 'ADMIN', tenantId: T_JAVIER });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetFakeDb();
  addFakeTenant({ id: T_JAVIER, name: 'Javier', slug: 'javier' });
  addFakeTenant({ id: T_OTRO, name: 'Otro', slug: 'otro' });
  addFakeUser({ id: 'u-super', username: 'root', role: 'SUPER_ADMIN', tenantId: null });
  addFakeUser({ id: 'u-admin', username: 'javier-admin', role: 'ADMIN', tenantId: T_JAVIER });
});

describe('GET /api/v1/admin/config', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(CONFIG);

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve los defaults cuando no hay settings', async () => {
    const config = await getConfig(adminToken);

    expect(config).toMatchObject({
      tenantId: T_JAVIER,
      publicName: null,
      whatsapp: '',
      footer: '',
      showUnavailable: false,
      offerOffline: true,
      updatedAt: null,
    });
  });

  it('devuelve los settings persistidos', async () => {
    addFakeTenantSettings({
      tenantId: T_JAVIER,
      publicName: 'Catálogo Javier',
      whatsapp: '+5355555555',
      footer: 'Tienda oficial',
      showUnavailable: true,
      offerOffline: false,
    });

    const config = await getConfig(adminToken);

    expect(config).toMatchObject({
      publicName: 'Catálogo Javier',
      whatsapp: '+5355555555',
      footer: 'Tienda oficial',
      showUnavailable: true,
      offerOffline: false,
    });
    expect(config.updatedAt).not.toBeNull();
  });

  it('ADMIN con ?tenantId de otro tenant recibe 403', async () => {
    const cross = await api(`${CONFIG}?tenantId=${T_OTRO}`, {}, adminToken);

    expect(cross.status).toBe(403);
    expect(cross.body.error?.code).toBe('FORBIDDEN');
  });

  it('SUPER_ADMIN sin tenantId recibe 400', async () => {
    const { status, body } = await api(CONFIG, {}, superToken);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('SUPER_ADMIN con tenantId inexistente recibe 422', async () => {
    const { status, body } = await api(
      `${CONFIG}?tenantId=00000000-0000-4000-8000-000000000000`,
      {},
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('SUPER_ADMIN con tenantId resuelve su config', async () => {
    const config = await getConfig(superToken, `?tenantId=${T_OTRO}`);

    expect(config.tenantId).toBe(T_OTRO);
    expect(config.showUnavailable).toBe(false);
  });

  it('rechaza tenantId que no es uuid', async () => {
    const { status, body } = await api(`${CONFIG}?tenantId=abc`, {}, adminToken);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/admin/config', () => {
  it('crea los settings en el primer update y audita', async () => {
    const { status, body } = await api<ConfigDto>(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({ publicName: 'Mi Tienda', footer: 'Pie' }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      tenantId: T_JAVIER,
      publicName: 'Mi Tienda',
      footer: 'Pie',
      whatsapp: '',
      showUnavailable: false,
      offerOffline: true,
    });

    const row = [...state.tenantSettings.values()].find((s) => s.tenantId === T_JAVIER);
    expect(row?.publicName).toBe('Mi Tienda');

    const log = [...state.auditLogs.values()].find((row2) => row2.action === 'CONFIG_UPDATED');
    expect(log).toMatchObject({
      entity: 'TenantSettings',
      tenantId: T_JAVIER,
      actorId: 'u-admin',
    });
    expect(log?.metadata).toMatchObject({ fields: ['publicName', 'footer'] });
  });

  it('actualiza solo los campos enviados', async () => {
    addFakeTenantSettings({
      tenantId: T_JAVIER,
      publicName: 'Original',
      whatsapp: '+5351111111',
    });

    const config = await getConfig(adminToken, '');
    expect(config.publicName).toBe('Original');

    const { status, body } = await api<ConfigDto>(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({ whatsapp: '+5352222222' }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      publicName: 'Original',
      whatsapp: '+5352222222',
    });
  });

  it('devuelve 400 si el body está vacío', async () => {
    const { status, body } = await api(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({}) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si publicName supera 50 caracteres', async () => {
    const { status, body } = await api(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({ publicName: 'x'.repeat(51) }) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si footer supera 120 caracteres', async () => {
    const { status, body } = await api(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({ footer: 'x'.repeat(121) }) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si showUnavailable no es booleano', async () => {
    const { status, body } = await api(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({ showUnavailable: 'si' }) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 403 si ADMIN intenta escribir la config de otro tenant', async () => {
    const { status, body } = await api(
      `${CONFIG}?tenantId=${T_OTRO}`,
      { method: 'PATCH', body: JSON.stringify({ publicName: 'Ajena' }) },
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('devuelve 400 si SUPER_ADMIN omite tenantId', async () => {
    const { status, body } = await api(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({ publicName: 'Plataforma' }) },
      superToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('SUPER_ADMIN actualiza la config de un tenant concreto', async () => {
    const { status, body } = await api<ConfigDto>(
      `${CONFIG}?tenantId=${T_OTRO}`,
      { method: 'PATCH', body: JSON.stringify({ publicName: 'Otro Tenant' }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data?.tenantId).toBe(T_OTRO);
    expect(body.data?.publicName).toBe('Otro Tenant');
  });
});

describe('config: showUnavailable afecta al catálogo §69', () => {
  it('el catálogo excluye ocultos por defecto', async () => {
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      title: 'Oculto',
      slug: `oculto-${randomUUID().slice(0, 8)}`,
      sizeValue: 1,
      sizeUnit: 'GB',
      availability: false,
    });

    const { body } = await api<{ games: unknown[] }>(`${CATALOG}/?tenant=javier`);

    expect(body.data?.games).toHaveLength(0);
  });

  it('activar showUnavailable incluye ocultos y sube la versión', async () => {
    addFakeTenantSettings({ tenantId: T_JAVIER, showUnavailable: false });
    state.catalogMetadata.set('meta-1', {
      id: 'meta-1',
      tenantId: T_JAVIER,
      version: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(await catalogVersion()).toBe(4);

    const { status } = await api(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({ showUnavailable: true }) },
      adminToken,
    );
    expect(status).toBe(200);

    expect(await catalogVersion()).toBe(5);

    const game = addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      title: 'Oculto',
      slug: `oculto-${randomUUID().slice(0, 8)}`,
      sizeValue: 1,
      sizeUnit: 'GB',
      availability: false,
    });

    const { body } = await api<{ games: { id: string }[] }>(`${CATALOG}/?tenant=javier`);
    expect(body.data?.games.map((item) => item.id)).toEqual([game.id]);
  });

  it('desactivar showUnavailable vuelve a excluir ocultos y sube la versión', async () => {
    addFakeTenantSettings({ tenantId: T_JAVIER, showUnavailable: true });

    const { status } = await api(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({ showUnavailable: false }) },
      adminToken,
    );
    expect(status).toBe(200);

    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      title: 'Oculto',
      slug: `oculto-${randomUUID().slice(0, 8)}`,
      sizeValue: 1,
      sizeUnit: 'GB',
      availability: false,
    });

    const { body } = await api<{ games: unknown[] }>(`${CATALOG}/?tenant=javier`);
    expect(body.data?.games).toHaveLength(0);
  });

  it('no sube la versión si showUnavailable no cambia', async () => {
    addFakeTenantSettings({ tenantId: T_JAVIER, showUnavailable: true });
    state.catalogMetadata.set('meta-2', {
      id: 'meta-2',
      tenantId: T_JAVIER,
      version: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { status } = await api(
      CONFIG,
      { method: 'PATCH', body: JSON.stringify({ showUnavailable: true }) },
      adminToken,
    );
    expect(status).toBe(200);

    expect(await catalogVersion()).toBe(7);
  });
});
