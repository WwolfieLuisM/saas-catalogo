import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import type { FakeBackup } from '../helpers/fakeDb.js';
import {
  addFakeCatalogMetadata,
  addFakeCategory,
  addFakeTenant,
  addFakeTenantGame,
  addFakeTenantSettings,
  addFakeUser,
  fakeDb,
  resetFakeDb,
  state,
} from '../helpers/fakeDb.js';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb: db } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => db, closePrisma: async () => undefined };
});

interface ApiBody<T> {
  success: boolean;
  data?: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  error?: { code: string; message: string };
}

interface BackupDto {
  id: string;
  tenantId: string | null;
  type: string;
  scope: 'PLATAFORMA' | 'TENANT';
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface VersionDto {
  version: number;
}

const BACKUPS = '/api/v1/admin/backups';
const CATALOG = '/api/v1/catalog';
const T_JAVIER = '11111111-1111-4111-8111-111111111111';
const T_OTRO = '22222222-2222-4222-8222-222222222222';

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;
let adminOtroToken: string;

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

async function createBackup(
  body: Record<string, unknown> = {},
  token?: string,
): Promise<BackupDto> {
  const { status, body: res } = await api<BackupDto>(
    BACKUPS,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
  expect(status).toBe(201);
  return res.data as BackupDto;
}

async function catalogVersion(): Promise<number> {
  const { body } = await api<VersionDto>(`${CATALOG}/version?tenant=javier`);
  return (body.data as VersionDto).version;
}

function seedGame(title = 'Juego Backup') {
  return addFakeTenantGame({
    id: randomUUID(),
    tenantId: T_JAVIER,
    title,
    slug: `backup-${randomUUID().slice(0, 8)}`,
    sizeValue: 5,
    sizeUnit: 'GB',
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
  adminOtroToken = await signAccessToken({ id: 'u-otro', role: 'ADMIN', tenantId: T_OTRO });
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

describe('POST /api/v1/admin/backups', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(BACKUPS, { method: 'POST', body: '{}' });

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('crea un backup TENANT con payload de los datos del tenant y audita', async () => {
    const game = seedGame();
    const category = addFakeCategory({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'Acción',
      slug: `accion-${randomUUID().slice(0, 8)}`,
    });
    addFakeTenantSettings({ tenantId: T_JAVIER, publicName: 'Mi Tienda' });

    const backup = await createBackup({}, adminToken);

    expect(backup).toMatchObject({
      tenantId: T_JAVIER,
      scope: 'TENANT',
      type: 'MANUAL',
      status: 'COMPLETED',
    });
    expect(backup).not.toHaveProperty('payload');

    const row = state.backups.get(backup.id) as FakeBackup;
    const payload = row.payload as {
      version: number;
      data: {
        tenantGames: { id: string }[];
        categories: { id: string }[];
        tenantSettings: unknown[];
      };
    };
    expect(payload.version).toBe(1);
    expect(payload.data.tenantGames.map((item) => item.id)).toEqual([game.id]);
    expect(payload.data.categories.map((item) => item.id)).toEqual([category.id]);
    expect(payload.data.tenantSettings).toHaveLength(1);

    const log = [...state.auditLogs.values()].find((item) => item.action === 'BACKUP_CREATED');
    expect(log).toMatchObject({
      entity: 'Backup',
      entityId: backup.id,
      tenantId: T_JAVIER,
      actorId: 'u-admin',
    });
  });

  it('ADMIN no puede crear un backup para otro tenant', async () => {
    const { status, body } = await api(
      BACKUPS,
      { method: 'POST', body: JSON.stringify({ tenantId: T_OTRO }) },
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('SUPER_ADMIN sin tenantId crea un backup PLATAFORMA', async () => {
    const backup = await createBackup({}, superToken);

    expect(backup).toMatchObject({ scope: 'PLATAFORMA', tenantId: null });
  });

  it('SUPER_ADMIN con tenantId crea un backup TENANT', async () => {
    const backup = await createBackup({ tenantId: T_OTRO }, superToken);

    expect(backup).toMatchObject({ scope: 'TENANT', tenantId: T_OTRO });
  });

  it('devuelve 422 si el tenant indicado no existe', async () => {
    const { status, body } = await api(
      BACKUPS,
      {
        method: 'POST',
        body: JSON.stringify({ tenantId: '00000000-0000-4000-8000-000000000000' }),
      },
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('acepta type PRE_IMPORT', async () => {
    const backup = await createBackup({ type: 'PRE_IMPORT' }, adminToken);

    expect(backup.type).toBe('PRE_IMPORT');
  });

  it('devuelve 400 si type no es válido', async () => {
    const { status, body } = await api(
      BACKUPS,
      { method: 'POST', body: JSON.stringify({ type: 'NADA' }) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('el payload PLATAFORMA incluye taxonomía global y juegos de todos los tenants', async () => {
    seedGame('Del Javier');
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_OTRO,
      title: 'Del Otro',
      slug: `otro-${randomUUID().slice(0, 8)}`,
      sizeValue: 1,
      sizeUnit: 'GB',
    });

    const backup = await createBackup({}, superToken);
    const row = state.backups.get(backup.id) as FakeBackup;
    const payload = row.payload as { data: { tenantGames: { tenantId: string }[] } };

    expect(payload.data.tenantGames).toHaveLength(2);
    expect(new Set(payload.data.tenantGames.map((item) => item.tenantId))).toEqual(
      new Set([T_JAVIER, T_OTRO]),
    );
  });
});

describe('GET /api/v1/admin/backups', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(BACKUPS);

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('ADMIN solo lista los backups de su tenant', async () => {
    await createBackup({}, adminToken);
    await createBackup({ tenantId: T_OTRO }, superToken);

    const { status, body } = await api<{ id: string; tenantId: string }[]>(BACKUPS, {}, adminToken);

    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data?.[0]?.tenantId).toBe(T_JAVIER);
    expect(body.meta).toMatchObject({ total: 1, page: 1 });
  });

  it('ADMIN con ?tenantId de otro tenant recibe 403', async () => {
    const { status, body } = await api(`${BACKUPS}?tenantId=${T_OTRO}`, {}, adminToken);

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('SUPER_ADMIN lista todos los backups', async () => {
    await createBackup({}, adminToken);
    await createBackup({ tenantId: T_OTRO }, superToken);
    await createBackup({}, superToken);

    const { status, body } = await api<BackupDto[]>(BACKUPS, {}, superToken);

    expect(status).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.meta).toMatchObject({ total: 3 });
  });

  it('SUPER_ADMIN filtra por ?tenantId', async () => {
    await createBackup({}, adminToken);
    await createBackup({ tenantId: T_OTRO }, superToken);

    const { status, body } = await api<BackupDto[]>(
      `${BACKUPS}?tenantId=${T_OTRO}`,
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data?.[0]?.tenantId).toBe(T_OTRO);
  });

  it('devuelve 422 si ?tenantId no existe', async () => {
    const { status, body } = await api(
      `${BACKUPS}?tenantId=00000000-0000-4000-8000-000000000000`,
      {},
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('no expone el payload en el listado', async () => {
    await createBackup({}, adminToken);

    const { body } = await api<BackupDto[]>(BACKUPS, {}, adminToken);

    expect(body.data?.[0]).not.toHaveProperty('payload');
    expect(JSON.stringify(body.data)).not.toContain('tenantGames');
  });

  it('ordena de más reciente a más antiguo', async () => {
    const primero = await createBackup({}, adminToken);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const segundo = await createBackup({}, adminToken);

    const { body } = await api<BackupDto[]>(BACKUPS, {}, adminToken);

    expect(body.data?.map((item) => item.id)).toEqual([segundo.id, primero.id]);
  });
});

describe('POST /api/v1/admin/backups/:id/restore', () => {
  it('devuelve 401 sin token', async () => {
    const backup = await createBackup({}, superToken);

    const { status, body } = await api(`${BACKUPS}/${backup.id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ confirm: 'RESTAURAR' }),
    });

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve 403 para role ADMIN', async () => {
    const backup = await createBackup({}, adminToken);

    const { status, body } = await api(
      `${BACKUPS}/${backup.id}/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('devuelve 404 si la copia no existe', async () => {
    const { status, body } = await api(
      `${BACKUPS}/00000000-0000-4000-8000-000000000000/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      superToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('BACKUP_NOT_FOUND');
  });

  it('devuelve 400 si falta confirm', async () => {
    const backup = await createBackup({}, superToken);

    const { status, body } = await api(
      `${BACKUPS}/${backup.id}/restore`,
      { method: 'POST', body: JSON.stringify({}) },
      superToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 422 si confirm no es RESTAURAR', async () => {
    const backup = await createBackup({}, superToken);

    const { status, body } = await api(
      `${BACKUPS}/${backup.id}/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'borrar' }) },
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('RESTORE_CONFIRM_REQUIRED');
  });

  it('devuelve 422 si el payload está corrupto', async () => {
    const id = randomUUID();
    state.backups.set(id, {
      id,
      tenantId: null,
      type: 'MANUAL',
      scope: 'PLATAFORMA',
      status: 'COMPLETED',
      payload: 'no-soy-json-estructurado',
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies FakeBackup);

    const { status, body } = await api(
      `${BACKUPS}/${id}/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('BACKUP_PAYLOAD_INVALID');
  });

  it('restaura el snapshot TENANT: revierte cambios posteriores a la copia', async () => {
    const original = seedGame('Original');
    const backup = await createBackup({}, adminToken);

    state.tenantGames.get(original.id)!.title = 'Mutado tras la copia';
    const posterior = seedGame('Creado tras la copia');

    const { status, body } = await api(
      `${BACKUPS}/${backup.id}/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: backup.id, scope: 'TENANT' });

    const games = [...state.tenantGames.values()].filter((game) => game.tenantId === T_JAVIER);
    expect(games.map((game) => game.id)).toEqual([original.id]);
    expect(games[0]?.title).toBe('Original');
    expect(state.tenantGames.has(posterior.id)).toBe(false);

    const log = [...state.auditLogs.values()].find((item) => item.action === 'RESTORE_COMPLETED');
    expect(log).toMatchObject({ entity: 'Backup', entityId: backup.id, actorId: 'u-super' });
  });

  it('restaura taxonomía, settings y metadata del tenant', async () => {
    const category = addFakeCategory({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'RPG',
      slug: `rpg-${randomUUID().slice(0, 8)}`,
    });
    addFakeTenantSettings({ tenantId: T_JAVIER, publicName: 'Antes' });
    const backup = await createBackup({}, adminToken);

    state.categories.delete(category.id);
    state.categories.set(randomUUID(), {
      ...category,
      id: 'categoria-nueva',
      name: 'Nueva',
      slug: 'nueva',
    });
    const settings = [...state.tenantSettings.values()].find((s) => s.tenantId === T_JAVIER);
    if (settings) settings.publicName = 'Después';

    const { status } = await api(
      `${BACKUPS}/${backup.id}/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      superToken,
    );
    expect(status).toBe(200);

    const categories = [...state.categories.values()].filter((row) => row.tenantId === T_JAVIER);
    expect(categories.map((row) => row.id)).toEqual([category.id]);
    const restoredSettings = [...state.tenantSettings.values()].find(
      (row) => row.tenantId === T_JAVIER,
    );
    expect(restoredSettings?.publicName).toBe('Antes');
  });

  it('avanza la versión del catálogo tras restaurar', async () => {
    const backup = await createBackup({}, adminToken);
    const meta = addFakeCatalogMetadata({
      id: randomUUID(),
      tenantId: T_JAVIER,
      version: 6,
    });

    expect(await catalogVersion()).toBe(6);

    const { status } = await api(
      `${BACKUPS}/${backup.id}/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      superToken,
    );
    expect(status).toBe(200);

    expect(await catalogVersion()).toBe(7);
    expect(state.catalogMetadata.has(meta.id)).toBe(false);
  });

  it('crea metadata adelantada si la copia no traía versión', async () => {
    const backup = await createBackup({}, adminToken);
    const row = state.backups.get(backup.id) as FakeBackup;
    const payload = row.payload as { data: { catalogMetadata: unknown[] } };
    payload.data.catalogMetadata = [];

    const { status } = await api(
      `${BACKUPS}/${backup.id}/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      superToken,
    );
    expect(status).toBe(200);

    expect(await catalogVersion()).toBe(1);
  });

  it('restaura el snapshot PLATAFORMA con datos de todos los tenants', async () => {
    seedGame('Javier antes');
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_OTRO,
      title: 'Otro antes',
      slug: `otro-${randomUUID().slice(0, 8)}`,
      sizeValue: 1,
      sizeUnit: 'GB',
    });
    const backup = await createBackup({}, superToken);

    state.tenantGames.clear();
    seedGame('Javier después');

    const { status } = await api(
      `${BACKUPS}/${backup.id}/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      superToken,
    );
    expect(status).toBe(200);

    const titles = [...state.tenantGames.values()].map((game) => game.title).sort();
    expect(titles).toEqual(['Javier antes', 'Otro antes']);

    const log = [...state.auditLogs.values()].find((item) => item.action === 'RESTORE_COMPLETED');
    expect(log).toMatchObject({ tenantId: null, actorId: 'u-super' });
  });

  it('la ruta exige uuid válido en :id', async () => {
    const { status, body } = await api(
      `${BACKUPS}/no-uuid/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      superToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('integridad del módulo', () => {
  it('el listado de ADMIN no incluye backups PLATAFORMA', async () => {
    await createBackup({}, superToken);

    const { body } = await api<BackupDto[]>(BACKUPS, {}, adminToken);

    expect(body.data).toHaveLength(0);
    expect(body.meta).toMatchObject({ total: 0 });
  });

  it('cada ADMIN solo ve los backups de su propio tenant', async () => {
    await createBackup({}, adminToken);
    await createBackup({ tenantId: T_OTRO }, superToken);

    const { body } = await api<BackupDto[]>(BACKUPS, {}, adminOtroToken);

    expect(body.data).toHaveLength(1);
    expect(body.data?.[0]?.tenantId).toBe(T_OTRO);
  });

  it('un restore de copia de otro tenant no afecta los datos propios del SUPER_ADMIN sin tenant', async () => {
    seedGame('Único');
    const backup = await createBackup({}, adminToken);

    const { status } = await api(
      `${BACKUPS}/${backup.id}/restore`,
      { method: 'POST', body: JSON.stringify({ confirm: 'RESTAURAR' }) },
      superToken,
    );
    expect(status).toBe(200);

    expect([...state.tenantGames.values()].map((game) => game.tenantId)).toEqual([T_JAVIER]);
  });

  it('fakeDb expone el delegate de backups', async () => {
    expect(typeof fakeDb.backup.create).toBe('function');
    expect(typeof fakeDb.backup.findMany).toBe('function');
    expect(typeof fakeDb.backup.deleteMany).toBe('function');
  });
});
