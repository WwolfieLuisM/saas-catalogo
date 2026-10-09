import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakeBaseGame,
  addFakeCatalogMetadata,
  addFakeCategory,
  addFakeGameMedia,
  addFakeGenre,
  addFakePlatform,
  addFakeTenant,
  addFakeTenantGame,
  addFakeTenantGameGenre,
  addFakeUser,
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
  error?: { code: string; message: string; details?: unknown };
}

interface PreviewData {
  warnings: string[];
  fingerprint: string;
  changes: {
    create: { index: number; title: string; slug: string; availability: boolean }[];
    update: { index: number; id: string; title: string; slug: string; fields: string[] }[];
    delete: { id: string; title: string; slug: string }[];
    unchanged: number;
  };
}

interface RunData {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  version: number;
}

interface ValidateData {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface BackupDto {
  id: string;
  tenantId: string | null;
  type: string;
  status: string;
}

const EXPORT = '/api/v1/admin/export';
const IMPORT = '/api/v1/admin/import';
const BACKUPS = '/api/v1/admin/backups';
const GAMES = '/api/v1/admin/games';
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

async function rawGet(path: string, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  return {
    status: response.status,
    disposition: response.headers.get('content-disposition'),
    body: (await response.json()) as Record<string, unknown>,
  };
}

function seedGame(overrides: Partial<Parameters<typeof addFakeTenantGame>[0]> = {}) {
  return addFakeTenantGame({
    id: randomUUID(),
    tenantId: T_JAVIER,
    title: 'Juego Seed',
    slug: `seed-${randomUUID().slice(0, 8)}`,
    description: 'Descripción seed',
    sizeValue: 5,
    sizeUnit: 'GB',
    ...overrides,
  });
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Juego Nuevo',
    slug: 'juego-nuevo-x',
    description: 'Nuevo ingreso',
    sizeValue: 3,
    sizeUnit: 'GB',
    ...overrides,
  };
}

function preview(catalog: unknown, token = adminToken) {
  return api<PreviewData>(
    `${IMPORT}/preview`,
    { method: 'POST', body: JSON.stringify({ catalog }) },
    token,
  );
}

async function createPreImportBackup(token = adminToken, tenantId?: string): Promise<string> {
  const { status, body } = await api<BackupDto>(
    `${IMPORT}/backup`,
    { method: 'POST', body: JSON.stringify(tenantId ? { tenantId } : {}) },
    token,
  );
  expect(status).toBe(201);
  return (body.data as BackupDto).id;
}

function auditByAction(action: string) {
  return [...state.auditLogs.values()].find((log) => log.action === action);
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

describe('GET /api/v1/admin/export/catalog', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(EXPORT);

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('exporta el catálogo con schema, juegos y cabecera de descarga, y audita', async () => {
    const category = addFakeCategory({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'Acción',
      slug: `accion-${randomUUID().slice(0, 8)}`,
    });
    const genre = addFakeGenre({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'RPG',
      slug: `rpg-${randomUUID().slice(0, 8)}`,
    });
    const game = seedGame({ categoryId: category.id });
    addFakeTenantGameGenre(game.id, genre.id);
    addFakeCatalogMetadata({ id: randomUUID(), tenantId: T_JAVIER, version: 7 });
    seedGame({ deletedAt: new Date() });

    const { status, disposition, body } = await rawGet(`${EXPORT}/catalog`, adminToken);

    expect(status).toBe(200);
    expect(disposition).toContain('catalogo-javier.json');
    expect(body['schema']).toBe('luismi-platform/catalog@1');
    expect(body['tenant']).toBe('javier');
    expect(body['version']).toBe(7);
    const games = body['games'] as Record<string, unknown>[];
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      id: game.id,
      title: 'Juego Seed',
      slug: game.slug,
      priceMode: 'RULE',
      availability: true,
      categorySlug: category.slug,
      genreSlugs: [genre.slug],
      platformSlugs: [],
    });

    const log = auditByAction('CATALOG_EXPORTED');
    expect(log).toMatchObject({ entity: 'TenantGame', tenantId: T_JAVIER, actorId: 'u-admin' });
    expect(log?.metadata).toMatchObject({ format: 'json', games: 1, version: 7 });
  });

  it('el ADMIN no puede exportar otro tenant', async () => {
    const { status, body } = await api(`${EXPORT}/catalog?tenantId=${T_OTRO}`, {}, adminToken);

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('exige tenantId para SUPER_ADMIN y valida que exista', async () => {
    const sinTenant = await api(`${EXPORT}/catalog`, {}, superToken);
    expect(sinTenant.status).toBe(400);
    expect(sinTenant.body.error?.code).toBe('VALIDATION_ERROR');

    const inexistente = await api(
      `${EXPORT}/catalog?tenantId=00000000-0000-4000-8000-000000000000`,
      {},
      superToken,
    );
    expect(inexistente.status).toBe(422);
    expect(inexistente.body.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('SUPER_ADMIN exporta un tenant indicado', async () => {
    seedGame({ title: 'De Otro', tenantId: T_OTRO, slug: `otro-${randomUUID().slice(0, 8)}` });

    const { status, body } = await rawGet(`${EXPORT}/catalog?tenantId=${T_OTRO}`, superToken);

    expect(status).toBe(200);
    expect(body['tenant']).toBe('otro');
    expect(body['games'] as unknown[]).toHaveLength(1);
  });
});

describe('GET /api/v1/admin/export/media-manifest', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(`${EXPORT}/media-manifest`);

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('lista los assets del tenant y audita MEDIA_MANIFEST_EXPORTED', async () => {
    const game = seedGame();
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_JAVIER,
      gameId: game.id,
      kind: 'COVER',
      publicId: 'cover-1',
      status: 'OK',
    });
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_OTRO,
      gameId: randomUUID(),
      kind: 'SHOT',
      publicId: 'otro-shot',
    });

    const { status, disposition, body } = await rawGet(`${EXPORT}/media-manifest`, adminToken);

    expect(status).toBe(200);
    expect(disposition).toContain('manifest-multimedia-javier.json');
    expect(body['schema']).toBe('luismi-platform/media-manifest@1');
    expect(body['assets']).toEqual([
      { publicId: 'cover-1', kind: 'COVER', gameId: game.id, status: 'OK' },
    ]);

    const log = auditByAction('MEDIA_MANIFEST_EXPORTED');
    expect(log).toMatchObject({ entity: 'GameMedia', tenantId: T_JAVIER, actorId: 'u-admin' });
    expect(log?.metadata).toMatchObject({ format: 'json', assets: 1 });
  });

  it('el ADMIN no puede exportar el manifiesto de otro tenant', async () => {
    const { status, body } = await api(
      `${EXPORT}/media-manifest?tenantId=${T_OTRO}`,
      {},
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/v1/admin/import/validate', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(`${IMPORT}/validate`, {
      method: 'POST',
      body: JSON.stringify({ catalog: { games: [] } }),
    });

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('acepta un catálogo válido con referencias resueltas', async () => {
    addFakeCategory({ id: randomUUID(), tenantId: T_JAVIER, name: 'RPG', slug: 'rpg-valido' });

    const { status, body } = await api<ValidateData>(
      `${IMPORT}/validate`,
      {
        method: 'POST',
        body: JSON.stringify({ catalog: { games: [entry({ categorySlug: 'rpg-valido' })] } }),
      },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('acepta referencias de slugs cortos como "pc" (roundtrip del seed)', async () => {
    addFakePlatform({ id: randomUUID(), tenantId: T_JAVIER, name: 'PC', slug: 'pc' });

    const { status, body } = await api<ValidateData>(
      `${IMPORT}/validate`,
      {
        method: 'POST',
        body: JSON.stringify({ catalog: { games: [entry({ platformSlugs: ['pc'] })] } }),
      },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('reporta formato inválido sin games', async () => {
    const { status, body } = await api<ValidateData>(
      `${IMPORT}/validate`,
      { method: 'POST', body: JSON.stringify({ catalog: { nada: true } }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.valid).toBe(false);
    expect(body.data?.errors).toEqual(['El archivo debe contener una lista "games"']);
  });

  it('rechaza campos desconocidos en una entrada', async () => {
    const { status, body } = await api<ValidateData>(
      `${IMPORT}/validate`,
      { method: 'POST', body: JSON.stringify({ catalog: { games: [entry({ genre: 'rpg' })] } }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.valid).toBe(false);
    expect(body.data?.errors[0]).toContain('campos no reconocidos: genre');
  });

  it('reporta referencias inexistentes', async () => {
    const { status, body } = await api<ValidateData>(
      `${IMPORT}/validate`,
      {
        method: 'POST',
        body: JSON.stringify({ catalog: { games: [entry({ genreSlugs: ['no-existe'] })] } }),
      },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.valid).toBe(false);
    expect(body.data?.errors[0]).toContain("el género 'no-existe' no existe en este catálogo");
  });

  it('el ADMIN no valida de otro tenant', async () => {
    const { status, body } = await api(
      `${IMPORT}/validate`,
      { method: 'POST', body: JSON.stringify({ tenantId: T_OTRO, catalog: { games: [] } }) },
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/v1/admin/import/preview', () => {
  it('devuelve 401 sin token', async () => {
    const { status } = await api(`${IMPORT}/preview`, {
      method: 'POST',
      body: JSON.stringify({ catalog: { games: [] } }),
    });

    expect(status).toBe(401);
  });

  it('devuelve 422 IMPORT_VALIDATION_FAILED con los errores', async () => {
    const { status, body } = await preview({ games: [entry({ slug: 'Malo Slug' })] });

    expect(status).toBe(422);
    expect(body.error?.code).toBe('IMPORT_VALIDATION_FAILED');
    expect(body.error?.details).toMatchObject({ errors: expect.any(Array) });
  });

  it('lista altas, cambios, borrados y sin cambios con fingerprint, sin mutar', async () => {
    const category = addFakeCategory({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'Acción',
      slug: 'accion-prev',
    });
    const genre = addFakeGenre({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'RPG',
      slug: 'rpg-prev',
    });
    const aModificado = seedGame({ title: 'A Modificar', slug: 'a-modificar' });
    addFakeTenantGameGenre(aModificado.id, genre.id);
    const bBorrado = seedGame({ title: 'A Borrar', slug: 'a-borrar' });
    seedGame({
      title: 'Igual',
      slug: 'igual-x',
      categoryId: category.id,
      sizeValue: 4,
      sizeUnit: 'MB',
      description: null,
    });

    const { status, body } = await preview({
      games: [
        entry({
          id: aModificado.id,
          title: 'A Modificado',
          slug: 'a-modificar',
          sizeValue: 5,
          sizeUnit: 'GB',
          description: 'Descripción seed',
          genreSlugs: ['rpg-prev'],
        }),
        entry({
          slug: 'igual-x',
          title: 'Igual',
          sizeValue: 4,
          sizeUnit: 'MB',
          description: null,
          categorySlug: 'accion-prev',
        }),
        entry({ slug: 'recien-nacido' }),
      ],
    });

    expect(status).toBe(200);
    const data = body.data as PreviewData;
    expect(data.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(data.changes.create).toEqual([
      { index: 2, title: 'Juego Nuevo', slug: 'recien-nacido', availability: true },
    ]);
    expect(data.changes.update).toEqual([
      {
        index: 0,
        id: aModificado.id,
        title: 'A Modificar',
        slug: 'a-modificar',
        fields: ['title'],
      },
    ]);
    expect(data.changes.delete).toEqual([{ id: bBorrado.id, title: 'A Borrar', slug: 'a-borrar' }]);
    expect(data.changes.unchanged).toBe(1);

    expect(state.tenantGames.get(aModificado.id)?.title).toBe('A Modificar');
    expect(state.tenantGames.get(bBorrado.id)?.deletedAt).toBeNull();
    expect(auditByAction('IMPORT_STARTED')).toBeUndefined();
    expect([...state.tenantGames.values()].some((row) => row.slug === 'recien-nacido')).toBe(false);
  });

  it('compara requirements sin importar el orden de las claves (jsonb)', async () => {
    const game = seedGame({
      slug: 'req-orden-x',
      minimumRequirements: { os: 'Windows 10', cpu: 'Ryzen 5', ram: '16 GB' },
      recommendedRequirements: { storage: 'SSD 512 GB', gpu: 'RTX 3060' },
    });

    const { status, body } = await preview({
      games: [
        entry({
          id: game.id,
          title: game.title,
          slug: game.slug,
          description: game.description,
          sizeValue: game.sizeValue,
          sizeUnit: game.sizeUnit,
          minimumRequirements: { cpu: 'Ryzen 5', ram: '16 GB', os: 'Windows 10' },
          recommendedRequirements: { gpu: 'RTX 3060', storage: 'SSD 512 GB' },
        }),
      ],
    });

    expect(status).toBe(200);
    expect(body.data?.changes).toMatchObject({
      create: [],
      update: [],
      delete: [],
      unchanged: 1,
    });
  });

  it('rechaza la entrada si su slug pertenece a un juego eliminado', async () => {
    seedGame({ title: 'Muerto', slug: 'muerto-x', deletedAt: new Date() });

    const { status, body } = await preview({ games: [entry({ slug: 'muerto-x' })] });

    expect(status).toBe(422);
    expect(body.error?.code).toBe('IMPORT_VALIDATION_FAILED');
    const details = body.error?.details as { errors: string[] };
    expect(details.errors[0]).toContain('restáuralo antes de importar');
  });

  it('emite advertencias no bloqueantes para campos de biblioteca', async () => {
    const base = addFakeBaseGame({
      id: randomUUID(),
      title: 'Base Hit',
      slug: 'base-hit-prev',
    });
    seedGame({
      title: 'Base Hit',
      slug: 'base-hit-prev',
      origin: 'BIBLIOTECA',
      baseGameId: base.id,
      sizeValue: 9,
      sizeUnit: 'GB',
      description: null,
    });

    const { status, body } = await preview({
      games: [
        entry({
          title: 'Otro Título',
          slug: 'base-hit-prev',
          sizeValue: 9,
          sizeUnit: 'GB',
          description: null,
        }),
      ],
    });

    expect(status).toBe(200);
    const data = body.data as PreviewData;
    expect(data.warnings[0]).toContain("campo de biblioteca 'title' ignorado");
    expect(data.changes.update).toHaveLength(0);
    expect(data.changes.unchanged).toBe(1);
  });
});

describe('POST /api/v1/admin/import/backup', () => {
  it('devuelve 401 sin token', async () => {
    const { status } = await api(`${IMPORT}/backup`, { method: 'POST', body: '{}' });

    expect(status).toBe(401);
  });

  it('crea un backup PRE_IMPORT del tenant y audita', async () => {
    seedGame();

    const { status, body } = await api<BackupDto>(
      `${IMPORT}/backup`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      tenantId: T_JAVIER,
      type: 'PRE_IMPORT',
      status: 'COMPLETED',
    });
    const row = state.backups.get((body.data as BackupDto).id);
    expect(row?.scope).toBe('TENANT');
    const log = [...state.auditLogs.values()].find((item) => item.action === 'BACKUP_CREATED');
    expect(log).toMatchObject({ entity: 'Backup', tenantId: T_JAVIER, actorId: 'u-admin' });
  });

  it('el ADMIN no crea copias de otro tenant', async () => {
    const { status, body } = await api(
      `${IMPORT}/backup`,
      { method: 'POST', body: JSON.stringify({ tenantId: T_OTRO }) },
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/v1/admin/import/run', () => {
  it('devuelve 401 sin token', async () => {
    const { status } = await api(`${IMPORT}/run`, {
      method: 'POST',
      body: JSON.stringify({
        catalog: { games: [] },
        confirm: 'IMPORTAR',
        backupId: randomUUID(),
        fingerprint: 'x',
      }),
    });

    expect(status).toBe(401);
  });

  it('devuelve 400 si faltan confirm, backupId o fingerprint', async () => {
    const { status, body } = await api(
      `${IMPORT}/run`,
      { method: 'POST', body: JSON.stringify({ catalog: { games: [] } }) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 422 IMPORT_CONFIRM_REQUIRED si confirm no es IMPORTAR', async () => {
    const { status, body } = await api(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: { games: [] },
          confirm: 'si',
          backupId: randomUUID(),
          fingerprint: 'deadbeef',
        }),
      },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('IMPORT_CONFIRM_REQUIRED');
  });

  it('devuelve 422 IMPORT_FORMAT_INVALID si el archivo no trae games', async () => {
    const { status, body } = await api(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: { nada: true },
          confirm: 'IMPORTAR',
          backupId: randomUUID(),
          fingerprint: 'deadbeef',
        }),
      },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('IMPORT_FORMAT_INVALID');
  });

  it('devuelve 404 si la copia no existe', async () => {
    const { status, body } = await api(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: { games: [] },
          confirm: 'IMPORTAR',
          backupId: randomUUID(),
          fingerprint: 'deadbeef',
        }),
      },
      adminToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('BACKUP_NOT_FOUND');
  });

  it('devuelve 422 IMPORT_BACKUP_INVALID si la copia no es PRE_IMPORT del tenant', async () => {
    const manual = await api<BackupDto>(
      BACKUPS,
      { method: 'POST', body: JSON.stringify({ type: 'MANUAL' }) },
      adminToken,
    );
    expect(manual.status).toBe(201);

    const { status, body } = await api(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: { games: [] },
          confirm: 'IMPORTAR',
          backupId: (manual.body.data as BackupDto).id,
          fingerprint: 'deadbeef',
        }),
      },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('IMPORT_BACKUP_INVALID');
  });

  it('devuelve 422 si la copia PRE_IMPORT pertenece a otro tenant', async () => {
    const ajena = await createPreImportBackup(adminOtroToken);

    const { status, body } = await api(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: { games: [] },
          confirm: 'IMPORTAR',
          backupId: ajena,
          fingerprint: 'deadbeef',
        }),
      },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('IMPORT_BACKUP_INVALID');
  });

  it('devuelve 409 IMPORT_PREVIEW_STALE sin tocar datos si el catálogo cambió', async () => {
    seedGame({ title: 'Único', slug: 'unico-x' });
    const backupId = await createPreImportBackup();
    const { status: previewStatus, body: previewBody } = await preview({ games: [] });
    expect(previewStatus).toBe(200);
    const stale = (previewBody.data as PreviewData).fingerprint;

    seedGame({ title: 'Agregado Tras Preview', slug: 'luego-x' });

    const { status, body } = await api<RunData>(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: { games: [] },
          confirm: 'IMPORTAR',
          backupId,
          fingerprint: stale,
        }),
      },
      adminToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('IMPORT_PREVIEW_STALE');
    expect(auditByAction('IMPORT_STARTED')).toBeUndefined();
    expect(auditByAction('IMPORT_COMPLETED')).toBeUndefined();
    const unico = [...state.tenantGames.values()].find((row) => row.slug === 'unico-x');
    expect(unico?.deletedAt).toBeNull();
  });

  it('aplica altas, cambios y borrados dentro de una transacción y audita', async () => {
    const category = addFakeCategory({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'Acción',
      slug: 'accion-run',
    });
    const genre = addFakeGenre({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'RPG',
      slug: 'rpg-run',
    });
    const platform = addFakePlatform({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'PC',
      slug: 'pc-run',
    });
    const aModificado = seedGame({ title: 'Viejo', slug: 'a-cambiar', categoryId: category.id });
    const bBorrado = seedGame({ title: 'Se Va', slug: 'se-va' });
    const cIgual = seedGame({ title: 'Queda', slug: 'queda-x' });
    addFakeCatalogMetadata({ id: randomUUID(), tenantId: T_JAVIER, version: 3 });

    const backupId = await createPreImportBackup();
    const catalog = {
      games: [
        entry({
          id: aModificado.id,
          title: 'Nuevo Nombre',
          slug: 'a-cambiar',
          genreSlugs: ['rpg-run'],
          platformSlugs: ['pc-run'],
        }),
        entry({
          id: cIgual.id,
          title: 'Queda',
          slug: 'queda-x',
          sizeValue: 5,
          sizeUnit: 'GB',
          description: 'Descripción seed',
        }),
        entry({ slug: 'creado-run', genreSlugs: ['rpg-run'], platformSlugs: ['pc-run'] }),
      ],
    };
    const { body: previewBody } = await preview(catalog);
    const fingerprint = (previewBody.data as PreviewData).fingerprint;

    const { status, body } = await api<RunData>(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({ catalog, confirm: 'IMPORTAR', backupId, fingerprint }),
      },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toEqual({ created: 1, updated: 1, deleted: 1, unchanged: 1, version: 4 });

    const actualizado = state.tenantGames.get(aModificado.id);
    expect(actualizado?.title).toBe('Nuevo Nombre');
    expect(actualizado?.updatedBy).toBe('u-admin');

    const creado = [...state.tenantGames.values()].find((row) => row.slug === 'creado-run');
    expect(creado).toBeDefined();
    expect(creado?.createdBy).toBe('u-admin');
    const genres = [...state.tenantGameGenres.values()].filter(
      (bridge) => bridge.tenantGameId === creado?.id,
    );
    expect(genres).toHaveLength(1);
    expect(genres[0]?.genreId).toBe(genre.id);
    const platforms = [...state.gamePlatforms.values()].filter(
      (bridge) => bridge.tenantGameId === creado?.id,
    );
    expect(platforms).toHaveLength(1);
    expect(platforms[0]?.platformId).toBe(platform.id);

    const borrado = state.tenantGames.get(bBorrado.id);
    expect(borrado?.deletedAt).toBeInstanceOf(Date);
    expect(borrado?.deletedBy).toBe('u-admin');

    const started = auditByAction('IMPORT_STARTED');
    expect(started).toMatchObject({ entity: 'TenantGame', tenantId: T_JAVIER, actorId: 'u-admin' });
    expect(started?.metadata).toMatchObject({ backupId, created: 1, updated: 1, deleted: 1 });
    const completed = auditByAction('IMPORT_COMPLETED');
    expect(completed).toMatchObject({
      entity: 'TenantGame',
      tenantId: T_JAVIER,
      actorId: 'u-admin',
    });
  });

  it('el roundtrip exportar e importar no produce cambios', async () => {
    const category = addFakeCategory({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'Aventura',
      slug: 'aventura-rt',
    });
    const genre = addFakeGenre({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'Indie',
      slug: 'indie-rt',
    });
    seedGame({ slug: 'rt-uno', categoryId: category.id, priceMode: 'MANUAL', price: 19.99 });
    const segundo = seedGame({ slug: 'rt-dos', releaseYear: 2021, description: null });
    addFakeTenantGameGenre(segundo.id, genre.id);

    const exported = await rawGet(`${EXPORT}/catalog`, adminToken);
    expect(exported.status).toBe(200);

    const backupId = await createPreImportBackup();
    const { status: previewStatus, body: previewBody } = await preview(exported.body);
    expect(previewStatus).toBe(200);
    const previewData = previewBody.data as PreviewData;
    expect(previewData.changes.create).toHaveLength(0);
    expect(previewData.changes.update).toHaveLength(0);
    expect(previewData.changes.delete).toHaveLength(0);
    expect(previewData.changes.unchanged).toBe(2);

    const { status, body } = await api<RunData>(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: exported.body,
          confirm: 'IMPORTAR',
          backupId,
          fingerprint: previewData.fingerprint,
        }),
      },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ created: 0, updated: 0, deleted: 0, unchanged: 2 });
    expect([...state.tenantGames.values()].filter((row) => !row.deletedAt)).toHaveLength(2);
  });
});

describe('límites de tamaño del cuerpo', () => {
  it('responde 413 en /import con cuerpos mayores a 5mb', async () => {
    const { status, body } = await api(
      `${IMPORT}/validate`,
      { method: 'POST', body: JSON.stringify({ catalog: 'x'.repeat(5 * 1024 * 1024) }) },
      adminToken,
    );

    expect(status).toBe(413);
    expect(body.error?.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('mantiene el límite de 1mb en el resto de rutas admin', async () => {
    const { status, body } = await api(
      GAMES,
      { method: 'POST', body: JSON.stringify({ title: 'x'.repeat(1024 * 1024) }) },
      adminToken,
    );

    expect(status).toBe(413);
    expect(body.error?.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
