import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => fakeDb, closePrisma: async () => undefined };
});

import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakePlatform,
  addFakeTenant,
  addFakeUser,
  resetFakeDb,
  state,
} from '../helpers/fakeDb.js';

const BASE = '/api/v1/admin/tenant-platforms';
const T_JAVIER = '11111111-1111-4111-8111-111111111111';
const T_OTRO = '22222222-2222-4222-8222-222222222222';

interface PlatformGlobal {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  enabled: boolean;
}

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

let baseUrl = '';
let server: Server;
let adminToken: string;
let superToken: string;

async function api<T = PlatformGlobal>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<{ status: number; body: ApiBody<T> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  return { status: response.status, body: (await response.json()) as ApiBody<T> };
}

function plataformaGlobal(slug: string, name = slug.toUpperCase()) {
  return addFakePlatform({ id: randomUUID(), tenantId: null, name, slug });
}

function plataformaDeTenant(slug: string, tenantId: string) {
  return addFakePlatform({
    id: randomUUID(),
    tenantId,
    name: slug.toUpperCase(),
    slug,
  });
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
  addFakeUser({ id: 'u-otro', username: 'otro-admin', role: 'ADMIN', tenantId: T_OTRO });
});

describe('GET /api/v1/admin/tenant-platforms', () => {
  it('lista las plataformas globales con su estado para el tenant de la sesión', async () => {
    const pc = plataformaGlobal('pc');
    plataformaGlobal('ps5');

    const { status, body } = await api<PlatformGlobal[]>(BASE, {}, adminToken);

    expect(status).toBe(200);
    const items = body.data ?? [];
    expect(items.map((item) => item.slug).sort()).toEqual(['pc', 'ps5']);
    expect(items.every((item) => item.enabled === false)).toBe(true);
    expect(items.find((item) => item.id === pc.id)?.enabled).toBe(false);
  });

  it('no incluye plataformas que pertenecen a un tenant', async () => {
    plataformaGlobal('pc');
    plataformaDeTenant('privada', T_JAVIER);

    const { body } = await api<PlatformGlobal[]>(BASE, {}, adminToken);

    expect((body.data ?? []).map((item) => item.slug)).toEqual(['pc']);
  });

  it('exige sesión', async () => {
    const { status } = await api(BASE);

    expect(status).toBe(401);
  });
});

describe('PATCH /api/v1/admin/tenant-platforms/:platformId', () => {
  it('habilita una plataforma global y el cambio persiste', async () => {
    const pc = plataformaGlobal('pc');

    const { status, body } = await api(
      `${BASE}/${pc.id}`,
      { method: 'PATCH', body: JSON.stringify({ enabled: true }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.enabled).toBe(true);
    const listado = await api<PlatformGlobal[]>(BASE, {}, adminToken);
    expect(listado.body.data?.find((item) => item.id === pc.id)?.enabled).toBe(true);
    expect(state.tenantPlatforms.get(`${T_JAVIER}:${pc.id}`)?.enabled).toBe(true);
  });

  it('deshabilita una plataforma que antes estaba habilitada', async () => {
    const pc = plataformaGlobal('pc');
    await api(`${BASE}/${pc.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) }, adminToken);

    const { status } = await api(
      `${BASE}/${pc.id}`,
      { method: 'PATCH', body: JSON.stringify({ enabled: false }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(state.tenantPlatforms.get(`${T_JAVIER}:${pc.id}`)?.enabled).toBe(false);
  });

  it('habilitar dos veces no duplica la fila', async () => {
    const pc = plataformaGlobal('pc');
    const patch = api(
      `${BASE}/${pc.id}`,
      { method: 'PATCH', body: JSON.stringify({ enabled: true }) },
      adminToken,
    );
    await patch;
    await patch;

    const filas = [...state.tenantPlatforms.values()].filter(
      (row) => row.tenantId === T_JAVIER && row.platformId === pc.id,
    );
    expect(filas).toHaveLength(1);
  });

  it('no habilita plataformas que no son globales', async () => {
    const propia = plataformaDeTenant('privada', T_JAVIER);

    const { status, body } = await api(
      `${BASE}/${propia.id}`,
      { method: 'PATCH', body: JSON.stringify({ enabled: true }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('PLATFORM_NOT_GLOBAL');
    expect(state.tenantPlatforms.size).toBe(0);
  });

  it('404 si la plataforma no existe', async () => {
    const { status, body } = await api(
      `${BASE}/${randomUUID()}`,
      { method: 'PATCH', body: JSON.stringify({ enabled: true }) },
      adminToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('PLATFORM_NOT_FOUND');
  });

  it('un ADMIN no habilita plataformas en el catálogo de otro tenant', async () => {
    const pc = plataformaGlobal('pc');

    const { status, body } = await api(
      `${BASE}/${pc.id}?tenantId=${T_OTRO}`,
      { method: 'PATCH', body: JSON.stringify({ enabled: true }) },
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
    expect(state.tenantPlatforms.size).toBe(0);
  });

  it('la habilitación de un tenant no afecta a otro', async () => {
    const pc = plataformaGlobal('pc');

    await api(`${BASE}/${pc.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) }, adminToken);
    await api<PlatformGlobal[]>(`${BASE}?tenantId=${T_OTRO}`, {}, superToken);

    expect(state.tenantPlatforms.get(`${T_JAVIER}:${pc.id}`)).toBeDefined();
    expect(state.tenantPlatforms.get(`${T_OTRO}:${pc.id}`)).toBeUndefined();
  });

  it('SUPER_ADMIN necesita tenantId explícito', async () => {
    const { status } = await api(BASE, {}, superToken);

    expect(status).toBe(400);
  });
});

describe('POST /api/v1/admin/tenant-platforms (plataforma global)', () => {
  it('un ADMIN no puede crear una plataforma global', async () => {
    const { status, body } = await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ name: 'PlayStation 6', slug: 'ps6' }) },
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
    const globales = [...state.platforms.values()].filter((row) => row.tenantId === null);
    expect(globales).toHaveLength(0);
  });

  it('SUPER_ADMIN sí crea una plataforma global y aparece en el listado', async () => {
    const { status, body } = await api<PlatformGlobal>(
      BASE,
      { method: 'POST', body: JSON.stringify({ name: 'PlayStation 6', slug: 'ps6' }) },
      superToken,
    );

    expect(status).toBe(201);
    expect(body.data?.slug).toBe('ps6');
    const creada = [...state.platforms.values()].find((row) => row.slug === 'ps6');
    expect(creada?.tenantId).toBeNull();

    const listado = await api<PlatformGlobal[]>(BASE, {}, adminToken);
    expect(listado.body.data?.map((item) => item.slug)).toContain('ps6');
  });

  it('rechaza un slug duplicado entre globales', async () => {
    plataformaGlobal('steam');

    const { status, body } = await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ name: 'Steam dos', slug: 'steam' }) },
      superToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('PLATFORM_SLUG_EXISTS');
  });

  it('audita la creación y el cambio de estado', async () => {
    const pc = plataformaGlobal('pc');

    await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ name: 'PlayStation 6', slug: 'ps6' }) },
      superToken,
    );
    await api(`${BASE}/${pc.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) }, adminToken);

    const acciones = [...state.auditLogs.values()].map((row) => row.action);
    expect(acciones).toContain('CREATE');
    expect(acciones).toContain('UPDATE');
  });
});