import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakeBaseGame,
  addFakeCatalogMetadata,
  addFakeGameMedia,
  addFakePlatform,
  addFakeTenant,
  addFakeTenantGame,
  addFakeTenantPlatform,
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

interface OfferChange {
  index: number;
  title: string | null;
  slug: string;
  platform: string;
  availability?: boolean;
  fields?: string[];
}

interface PreviewData {
  warnings: string[];
  fingerprint: string;
  changes: {
    create: OfferChange[];
    update: (OfferChange & { id: string })[];
    delete: { id: string; title: string | null; slug: string }[];
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

const CATALOG_V2 = 'luismi-platform/catalog@2';
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

function plataformaGlobal(slug: string): string {
  const id = `plataforma-${slug}`;
  if (![...state.platforms.values()].some((row) => row.slug === slug)) {
    addFakePlatform({ id, tenantId: null, name: slug.toUpperCase(), slug });
  }
  return id;
}

function habilitarPlataforma(tenantId: string, platformId: string, enabled = true): void {
  addFakeTenantPlatform({ tenantId, platformId, enabled });
}

function baseGame(slug: string, overrides: Record<string, unknown> = {}): string {
  const id = `base-${slug}`;
  addFakeBaseGame({ id, slug, title: `Juego ${slug}`, ...overrides });
  return id;
}

function offer(overrides: Record<string, unknown> = {}) {
  const baseGameSlug = (overrides['baseGameSlug'] as string) ?? 'juego-nuevo-x';
  const platformSlug = (overrides['platformSlug'] as string) ?? 'pc';

  if (![...state.baseGames.values()].some((row) => row.slug === baseGameSlug)) {
    baseGame(baseGameSlug);
  }
  habilitarPlataforma(T_JAVIER, plataformaGlobal(platformSlug));

  return { baseGameSlug, platformSlug, ...overrides };
}

function catalog(offers: unknown[]): Record<string, unknown> {
  return { schema: CATALOG_V2, offers };
}

function preview(offers: unknown[], token = adminToken) {
  return api<PreviewData>(
    `${IMPORT}/preview`,
    { method: 'POST', body: JSON.stringify({ catalog: catalog(offers) }) },
    token,
  );
}

function validate(offers: unknown[], token = adminToken) {
  return api<ValidateData>(
    `${IMPORT}/validate`,
    { method: 'POST', body: JSON.stringify({ catalog: catalog(offers) }) },
    token,
  );
}

function seedOferta(overrides: Record<string, unknown> = {}): string {
  const baseGameSlug = (overrides['baseGameSlug'] as string) ?? 'juego-seed';
  const platformSlug = (overrides['platformSlug'] as string) ?? 'pc';
  const platformId = plataformaGlobal(platformSlug);
  const baseGameId = baseGame(baseGameSlug);
  habilitarPlataforma(T_JAVIER, platformId);

  return addFakeTenantGame({
    id: randomUUID(),
    tenantId: T_JAVIER,
    baseGameId,
    platformId,
    origin: 'BIBLIOTECA',
    slug: `${baseGameSlug}-${platformSlug}`,
    title: null,
    ...overrides,
  }).id;
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

  it('exporta catalog@2 con una oferta por plataforma y valores crudos, y audita', async () => {
    addFakeCatalogMetadata({ id: randomUUID(), tenantId: T_JAVIER, version: 7 });
    const game = seedOferta({ baseGameSlug: 'zelda', platformSlug: 'pc' });
    seedOferta({ baseGameSlug: 'zelda', platformSlug: 'ps4' });
    seedOferta({ baseGameSlug: 'muerto', platformSlug: 'pc', deletedAt: new Date() });

    const { status, disposition, body } = await rawGet(`${EXPORT}/catalog`, adminToken);

    expect(status).toBe(200);
    expect(disposition).toContain('catalogo-javier.json');
    expect(body['schema']).toBe(CATALOG_V2);
    expect(body['source']).toBe('catalogo-javier');
    expect(body['generatedAt']).toEqual(expect.any(String));

    const offers = body['offers'] as Record<string, unknown>[];
    expect(offers).toHaveLength(2);
    expect(offers.find((item) => item['platformSlug'] === 'pc')).toMatchObject({
      baseGameSlug: 'zelda',
      platformSlug: 'pc',
      slug: 'zelda-pc',
      priceMode: 'RULE',
      price: null,
      availability: true,
      title: null,
    });
    expect(offers.find((item) => item['platformSlug'] === 'ps4')).toMatchObject({
      baseGameSlug: 'zelda',
      platformSlug: 'ps4',
      slug: 'zelda-ps4',
    });
    expect(offers.every((item) => !('id' in item))).toBe(true);
    expect(body['skipped']).toEqual([]);
    expect(state.tenantGames.get(game)?.title).toBeNull();

    const log = auditByAction('CATALOG_EXPORTED');
    expect(log).toMatchObject({ entity: 'TenantGame', tenantId: T_JAVIER, actorId: 'u-admin' });
    expect(log?.metadata).toMatchObject({ format: 'json', games: 2, version: 7 });
  });

  it('expone los overrides materiales y los clearedFields', async () => {
    seedOferta({
      baseGameSlug: 'elden-ring',
      platformSlug: 'pc',
      title: 'Elden Ring edición PC',
      description: 'Edición del tenant',
      sizeValue: 60,
      sizeUnit: 'GB',
      releaseYear: 2022,
      priceMode: 'MANUAL',
      price: 59.99,
      minimumRequirements: { cpu: 'Ryzen 5 3600' },
      clearedFields: ['description'],
    });

    const { body } = await rawGet(`${EXPORT}/catalog`, adminToken);

    expect((body['offers'] as Record<string, unknown>[])[0]).toMatchObject({
      title: 'Elden Ring edición PC',
      description: 'Edición del tenant',
      sizeValue: 60,
      sizeUnit: 'GB',
      releaseYear: 2022,
      priceMode: 'MANUAL',
      price: 59.99,
      minimumRequirements: { cpu: 'Ryzen 5 3600' },
      clearedFields: ['description'],
    });
  });

  it('excluye las ofertas sin biblioteca con motivo explícito en lugar de emitirlas', async () => {
    seedOferta({ baseGameSlug: 'con-biblioteca', platformSlug: 'pc' });
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      baseGameId: null,
      platformId: plataformaGlobal('pc'),
      origin: 'PERSONALIZADO',
      title: 'Solo manual',
      slug: 'solo-manual',
    });

    const { status, body } = await rawGet(`${EXPORT}/catalog`, adminToken);

    expect(status).toBe(200);
    expect(body['offers']).toHaveLength(1);
    expect(body['skipped']).toEqual([{ slug: 'solo-manual', reason: expect.stringContaining('biblioteca') }]);
    expect(body['notice']).toEqual(expect.any(String));
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
    seedOferta({ tenantId: T_OTRO, baseGameSlug: 'de-otro', platformSlug: 'pc' });

    const { status, body } = await rawGet(`${EXPORT}/catalog?tenantId=${T_OTRO}`, superToken);

    expect(status).toBe(200);
    expect(body['source']).toBe('catalogo-otro');
    expect(body['offers'] as unknown[]).toHaveLength(1);
  });
});

describe('GET /api/v1/admin/export/media-manifest', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(`${EXPORT}/media-manifest`);

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('lista los assets del tenant y audita MEDIA_MANIFEST_EXPORTED', async () => {
    const game = seedOferta();
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_JAVIER,
      gameId: game,
      kind: 'COVER',
      publicId: 'cover-1',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/cover-1.jpg',
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
    expect(body['notice']).toContain('No es un archivo de restauración');
    expect(body['totals']).toMatchObject({ assets: 1, cloudinary: 1, external: 0 });
    expect(body['assets']).toEqual([
      {
        id: expect.any(String),
        kind: 'COVER',
        gameId: game,
        gameTitle: null,
        gameSlug: expect.any(String),
        status: 'OK',
        url: 'https://res.cloudinary.com/demo/image/upload/v1/cover-1.jpg',
        publicId: 'cover-1',
        hosting: 'cloudinary',
        provider: 'cloudinary',
      },
    ]);

    const log = auditByAction('MEDIA_MANIFEST_EXPORTED');
    expect(log).toMatchObject({ entity: 'GameMedia', tenantId: T_JAVIER, actorId: 'u-admin' });
    expect(log?.metadata).toMatchObject({ format: 'json', assets: 1 });
  });

  it('exporta URLs externas aunque publicId sea null', async () => {
    const game = seedOferta();
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_JAVIER,
      gameId: game,
      kind: 'COVER',
      publicId: null,
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg',
      status: 'OK',
    });

    const { status, body } = await rawGet(`${EXPORT}/media-manifest`, adminToken);

    expect(status).toBe(200);
    const assets = body['assets'] as Record<string, unknown>[];
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg',
      publicId: null,
      hosting: 'external',
      provider: 'igdb',
    });
    expect(body['totals']).toMatchObject({ external: 1, missingPublicId: 1 });
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
      body: JSON.stringify({ catalog: catalog([]) }),
    });

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('acepta una oferta mínima (juego de biblioteca + plataforma habilitada)', async () => {
    const { status, body } = await validate([offer()]);

    expect(status).toBe(200);
    expect(body.data).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('rechaza catalog@1 con el mensaje de regeneración', async () => {
    const { status, body } = await api<ValidateData>(
      `${IMPORT}/validate`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: { schema: 'luismi-platform/catalog@1', games: [{ title: 'X', slug: 'x-y' }] },
        }),
      },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('CATALOG_SCHEMA_UNSUPPORTED');
    expect(body.error?.message).toContain('Regenera el catálogo con el contrato nuevo');
  });

  it('rechaza un manifiesto multimedia enviado como catálogo', async () => {
    const manifest = {
      schema: 'luismi-platform/media-manifest@1',
      exportedAt: new Date().toISOString(),
      tenant: 'javier',
      notice: 'Inventario de solo lectura.',
      totals: { assets: 1 },
      assets: [{ id: randomUUID(), kind: 'COVER', url: 'https://images.igdb.com/a.jpg' }],
    };

    const { status, body } = await api<ValidateData>(
      `${IMPORT}/validate`,
      { method: 'POST', body: JSON.stringify({ catalog: manifest }) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('CATALOG_SCHEMA_UNSUPPORTED');
  });

  it('rechaza campos desconocidos en una oferta', async () => {
    const { status, body } = await validate([offer({ categorySlug: 'rpg', genreSlugs: ['accion'] })]);

    expect(status).toBe(200);
    expect(body.data?.valid).toBe(false);
    expect(body.data?.errors[0]).toContain('campos no reconocidos');
  });

  it('exige baseGameSlug y platformSlug', async () => {
    const { status, body } = await validate([{ slug: 'sin-referencias' }]);

    expect(status).toBe(200);
    expect(body.data?.valid).toBe(false);
    expect(body.data?.errors).toHaveLength(2);
  });

  it('reporta un juego de biblioteca inexistente', async () => {
    const { status, body } = await validate([
      { baseGameSlug: 'no-existe', platformSlug: 'pc' },
    ]);

    expect(status).toBe(200);
    expect(body.data?.errors[0]).toContain("'no-existe' no existe en la biblioteca");
  });

  it('reporta una plataforma que no existe en el catálogo global', async () => {
    baseGame('juego-x');

    const { status, body } = await validate([{ baseGameSlug: 'juego-x', platformSlug: 'nintendo-64' }]);

    expect(status).toBe(200);
    expect(body.data?.errors[0]).toContain("'nintendo-64' no existe en el catálogo global");
  });

  it('reporta una plataforma que el tenant no tiene habilitada', async () => {
    baseGame('juego-x');
    const ps5 = plataformaGlobal('ps5');
    addFakeTenantPlatform({ tenantId: T_JAVIER, platformId: ps5, enabled: false });

    const { status, body } = await validate([{ baseGameSlug: 'juego-x', platformSlug: 'ps5' }]);

    expect(status).toBe(200);
    expect(body.data?.errors[0]).toContain("'ps5' no está habilitada");
  });

  it('no auto-crea la plataforma ni la habilitación: cero escrituras de plataforma', async () => {
    baseGame('juego-x');
    const ps5 = plataformaGlobal('ps5');
    addFakeTenantPlatform({ tenantId: T_JAVIER, platformId: ps5, enabled: false });

    await validate([{ baseGameSlug: 'juego-x', platformSlug: 'ps5' }]);

    expect(state.platforms.get(ps5)?.tenantId).toBeNull();
    expect(state.tenantPlatforms.get(`${T_JAVIER}:${ps5}`)?.enabled).toBe(false);
  });

  it('reporta sizeValue y sizeUnit descolocados', async () => {
    const { status, body } = await validate([offer({ sizeValue: 40 })]);

    expect(status).toBe(200);
    expect(body.data?.valid).toBe(false);
    expect(body.data?.errors[0]).toContain('sizeValue y sizeUnit van siempre en pareja');
  });

  it('reporta dos ofertas del mismo juego y plataforma', async () => {
    const { status, body } = await validate([
      offer({ baseGameSlug: 'mario', platformSlug: 'pc', slug: 'mario-pc' }),
      offer({ baseGameSlug: 'mario', platformSlug: 'pc', slug: 'mario-pc-edicion' }),
    ]);

    expect(status).toBe(200);
    expect(body.data?.valid).toBe(false);
    expect(body.data?.errors[0]).toContain("ya existe una oferta de 'mario' en 'pc'");
  });

  it('el ADMIN no valida de otro tenant', async () => {
    const { status, body } = await api(
      `${IMPORT}/validate`,
      { method: 'POST', body: JSON.stringify({ tenantId: T_OTRO, catalog: catalog([]) }) },
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
      body: JSON.stringify({ catalog: catalog([]) }),
    });

    expect(status).toBe(401);
  });

  it('devuelve 422 IMPORT_VALIDATION_FAILED con los errores', async () => {
    const { status, body } = await preview([{ baseGameSlug: 'no-existe', platformSlug: 'pc' }]);

    expect(status).toBe(422);
    expect(body.error?.code).toBe('IMPORT_VALIDATION_FAILED');
    const details = body.error?.details as { errors: string[] };
    expect(details.errors[0]).toContain('Oferta 1');
  });

  it('crea la oferta heredando el título y con la plataforma resuelta', async () => {
    const { status, body } = await preview([offer({ baseGameSlug: 'zelda', platformSlug: 'ps5' })]);

    expect(status).toBe(200);
    const data = body.data as PreviewData;
    expect(data.changes.create).toEqual([
      { index: 0, title: null, slug: 'zelda-ps5', platform: 'ps5', availability: true },
    ]);
    expect(state.tenantGames.size).toBe(0);
  });

  it('materializa el override del título y marca la oferta como personalizada', async () => {
    seedOferta({ baseGameSlug: 'zelda', platformSlug: 'ps5', origin: 'BIBLIOTECA' });

    const { status, body } = await preview([
      offer({ baseGameSlug: 'zelda', platformSlug: 'ps5', title: 'Zelda en PS5' }),
    ]);

    expect(status).toBe(200);
    const data = body.data as PreviewData;
    expect(data.changes.update[0]?.fields).toEqual(['title', 'origin']);
  });

  it('no borra las ofertas de plataformas que el archivo no declara', async () => {
    seedOferta({ baseGameSlug: 'a-en-pc', platformSlug: 'pc' });
    seedOferta({ baseGameSlug: 'a-en-ps4', platformSlug: 'ps4' });
    seedOferta({ baseGameSlug: 'otra-en-ps4', platformSlug: 'ps4' });

    const { status, body } = await preview([offer({ baseGameSlug: 'a-en-pc', platformSlug: 'pc' })]);

    expect(status).toBe(200);
    const data = body.data as PreviewData;
    expect(data.changes.delete).toEqual([]);
    expect(data.changes.unchanged).toBe(1);
    expect(data.warnings.some((warning) => warning.includes('ps4'))).toBe(true);
  });

  it('borra dentro de las plataformas declaradas las ofertas que no llegan', async () => {
    seedOferta({ baseGameSlug: 'queda', platformSlug: 'ps4' });
    const fuera = seedOferta({ baseGameSlug: 'fuera', platformSlug: 'xbox' });
    const seVa = seedOferta({ baseGameSlug: 'se-va', platformSlug: 'ps4' });

    const { status, body } = await preview([offer({ baseGameSlug: 'queda', platformSlug: 'ps4' })]);

    expect(status).toBe(200);
    const data = body.data as PreviewData;
    expect(data.changes.delete).toEqual([{ id: seVa, title: null, slug: 'se-va-ps4' }]);
    expect(data.changes.delete.some((item) => item.id === fuera)).toBe(false);
  });

  it('ignora el slug explícito de una oferta existente sin renombrarla', async () => {
    seedOferta({ baseGameSlug: 'zelda', platformSlug: 'pc' });

    const { status, body } = await preview([
      offer({ baseGameSlug: 'zelda', platformSlug: 'pc', slug: 'otro-slug', title: 'Zelda PC' }),
    ]);

    expect(status).toBe(200);
    const data = body.data as PreviewData;
    expect(data.warnings.some((warning) => warning.includes('otro-slug'))).toBe(true);
    expect(data.changes.update[0]?.slug).toBe('zelda-pc');
    expect(data.changes.update[0]?.fields).not.toContain('slug');
  });

  it('los null no borran datos buenos y los ausentes no cambian nada', async () => {
    seedOferta({
      baseGameSlug: 'zelda',
      platformSlug: 'pc',
      description: 'Descripción del tenant',
      origin: 'PERSONALIZADO',
    });

    const { status, body } = await preview([
      offer({ baseGameSlug: 'zelda', platformSlug: 'pc', description: null, releaseYear: null }),
    ]);

    expect(status).toBe(200);
    expect((body.data as PreviewData).changes.update).toHaveLength(0);
  });

  it('aplica clearedFields y compara requirements sin importar el orden de las claves', async () => {
    seedOferta({
      baseGameSlug: 'elden-ring',
      platformSlug: 'pc',
      minimumRequirements: { cpu: 'Ryzen 5', ram: '16 GB', os: 'Windows 10' },
    });

    const { status, body } = await preview([
      offer({
        baseGameSlug: 'elden-ring',
        platformSlug: 'pc',
        clearedFields: ['description'],
        minimumRequirements: { os: 'Windows 10', ram: '16 GB', cpu: 'Ryzen 5' },
      }),
    ]);

    expect(status).toBe(200);
    expect((body.data as PreviewData).changes.update[0]?.fields).toEqual([
      'clearedFields',
      'origin',
    ]);
  });

  it('rechaza la oferta si su identidad pertenece a una oferta eliminada', async () => {
    seedOferta({ baseGameSlug: 'muerto', platformSlug: 'pc', deletedAt: new Date() });

    const { status, body } = await preview([offer({ baseGameSlug: 'muerto', platformSlug: 'pc' })]);

    expect(status).toBe(422);
    const details = body.error?.details as { errors: string[] };
    expect(details.errors[0]).toContain('restáuralo antes de importar');
  });

  it('rechaza un slug que ya pertenece a una oferta personalizada', async () => {
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      baseGameId: null,
      platformId: plataformaGlobal('pc'),
      origin: 'PERSONALIZADO',
      title: 'Manual',
      slug: 'zelda-pc',
    });

    const { status, body } = await preview([offer({ baseGameSlug: 'zelda', platformSlug: 'pc' })]);

    expect(status).toBe(422);
    const details = body.error?.details as { errors: string[] };
    expect(details.errors[0]).toContain('pertenece a una oferta personalizada');
  });

  it('no muta nada al previsualizar', async () => {
    const game = seedOferta({ baseGameSlug: 'zelda', platformSlug: 'pc' });

    const { status, body } = await preview([
      offer({ baseGameSlug: 'zelda', platformSlug: 'pc', title: 'Cambiado' }),
      offer({ baseGameSlug: 'nuevo', platformSlug: 'pc' }),
    ]);

    expect(status).toBe(200);
    expect((body.data as PreviewData).fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(state.tenantGames.get(game)?.title).toBeNull();
    expect(state.tenantGames.size).toBe(1);
    expect(auditByAction('IMPORT_STARTED')).toBeUndefined();
  });
});

describe('POST /api/v1/admin/import/backup', () => {
  it('devuelve 401 sin token', async () => {
    const { status } = await api(`${IMPORT}/backup`, { method: 'POST', body: '{}' });

    expect(status).toBe(401);
  });

  it('crea un backup PRE_IMPORT del tenant y audita', async () => {
    seedOferta();

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
        catalog: catalog([]),
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
      { method: 'POST', body: JSON.stringify({ catalog: catalog([]) }) },
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
          catalog: catalog([]),
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

  it('devuelve 400 si el archivo no declara catalog@2', async () => {
    const { status, body } = await api(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: { schema: CATALOG_V2, nada: true },
          confirm: 'IMPORTAR',
          backupId: randomUUID(),
          fingerprint: 'deadbeef',
        }),
      },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('CATALOG_SCHEMA_UNSUPPORTED');
  });

  it('devuelve 404 si la copia no existe', async () => {
    const { status, body } = await api(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: catalog([]),
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
          catalog: catalog([]),
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
          catalog: catalog([]),
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
    seedOferta({ baseGameSlug: 'unico', platformSlug: 'pc' });
    const backupId = await createPreImportBackup();
    const { status: previewStatus, body: previewBody } = await preview([
      offer({ baseGameSlug: 'unico', platformSlug: 'pc' }),
    ]);
    expect(previewStatus).toBe(200);
    const stale = (previewBody.data as PreviewData).fingerprint;

    seedOferta({ baseGameSlug: 'luego', platformSlug: 'pc' });

    const { status, body } = await api<RunData>(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: catalog([]),
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
    expect(
      [...state.tenantGames.values()].filter((row) => row.slug === 'unico-pc'),
    ).toHaveLength(1);
  });

  it('aplica altas, cambios y borrados dentro de una transacción y audita', async () => {
    addFakeCatalogMetadata({ id: randomUUID(), tenantId: T_JAVIER, version: 3 });
    const aModificado = seedOferta({ baseGameSlug: 'a-cambiar', platformSlug: 'pc' });
    const bBorrado = seedOferta({ baseGameSlug: 'se-va', platformSlug: 'pc' });
    const cIgual = seedOferta({ baseGameSlug: 'queda', platformSlug: 'pc' });
    const fuera = seedOferta({ baseGameSlug: 'intocable', platformSlug: 'ps4' });

    const backupId = await createPreImportBackup();
    const offers = [
      offer({ baseGameSlug: 'a-cambiar', platformSlug: 'pc', title: 'Nuevo Nombre', price: 24.5, priceMode: 'MANUAL' }),
      offer({ baseGameSlug: 'queda', platformSlug: 'pc' }),
      offer({ baseGameSlug: 'creado', platformSlug: 'pc', sizeValue: 12, sizeUnit: 'GB' }),
      offer({ baseGameSlug: 'creado-heredado', platformSlug: 'pc' }),
    ];
    const { body: previewBody } = await preview(offers);
    const fingerprint = (previewBody.data as PreviewData).fingerprint;

    const { status, body } = await api<RunData>(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({ catalog: catalog(offers), confirm: 'IMPORTAR', backupId, fingerprint }),
      },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toEqual({ created: 2, updated: 1, deleted: 1, unchanged: 1, version: 4 });

    const actualizado = state.tenantGames.get(aModificado);
    expect(actualizado?.title).toBe('Nuevo Nombre');
    expect(actualizado?.origin).toBe('PERSONALIZADO');
    expect(actualizado?.updatedBy).toBe('u-admin');
    expect(actualizado?.platformId).toBe('plataforma-pc');

    const creado = [...state.tenantGames.values()].find((row) => row.slug === 'creado-pc');
    expect(creado?.baseGameId).toBe('base-creado');
    expect(creado?.platformId).toBe('plataforma-pc');
    expect(creado?.title).toBeNull();
    expect(creado?.origin).toBe('PERSONALIZADO');
    expect(creado?.sizeValue).toBe(12);
    expect(creado?.createdBy).toBe('u-admin');

    const heredado = [...state.tenantGames.values()].find(
      (row) => row.slug === 'creado-heredado-pc',
    );
    expect(heredado?.title).toBeNull();
    expect(heredado?.origin).toBe('BIBLIOTECA');

    expect(state.tenantGames.get(bBorrado)?.deletedAt).toBeInstanceOf(Date);
    expect(state.tenantGames.get(bBorrado)?.deletedBy).toBe('u-admin');
    expect(state.tenantGames.get(cIgual)?.updatedAt).toBeDefined();
    expect(state.tenantGames.get(fuera)?.deletedAt).toBeNull();

    const started = auditByAction('IMPORT_STARTED');
    expect(started).toMatchObject({ entity: 'TenantGame', tenantId: T_JAVIER, actorId: 'u-admin' });
    expect(started?.metadata).toMatchObject({ backupId, created: 2, updated: 1, deleted: 1 });
    expect(auditByAction('IMPORT_COMPLETED')).toMatchObject({ tenantId: T_JAVIER });
  });

  it('es idempotente: reimportar el mismo archivo no escribe nada', async () => {
    seedOferta({ baseGameSlug: 'zelda', platformSlug: 'pc' });
    const offers = [
      offer({ baseGameSlug: 'zelda', platformSlug: 'pc', title: 'Zelda PC' }),
      offer({ baseGameSlug: 'mario', platformSlug: 'pc' }),
    ];

    const backupId = await createPreImportBackup();
    const { body: firstPreview } = await preview(offers);
    const first = await api<RunData>(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: catalog(offers),
          confirm: 'IMPORTAR',
          backupId,
          fingerprint: (firstPreview.data as PreviewData).fingerprint,
        }),
      },
      adminToken,
    );
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ created: 1, updated: 1 });

    const { body: secondPreview } = await preview(offers);
    const second = await api<RunData>(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: catalog(offers),
          confirm: 'IMPORTAR',
          backupId,
          fingerprint: (secondPreview.data as PreviewData).fingerprint,
        }),
      },
      adminToken,
    );

    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ created: 0, updated: 0, deleted: 0, unchanged: 2 });
    expect(state.tenantGames.size).toBe(2);
  });

  it('no escribe nada fuera del tenant de la sesión', async () => {
    seedOferta({ tenantId: T_OTRO, baseGameSlug: 'de-otro', platformSlug: 'pc' });

    const backupId = await createPreImportBackup();
    const offers = [offer({ baseGameSlug: 'mio', platformSlug: 'pc' })];
    const { body: previewBody } = await preview(offers);
    const { status } = await api<RunData>(
      `${IMPORT}/run`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalog: catalog(offers),
          confirm: 'IMPORTAR',
          backupId,
          fingerprint: (previewBody.data as PreviewData).fingerprint,
        }),
      },
      adminToken,
    );

    expect(status).toBe(200);
    const ajena = [...state.tenantGames.values()].find((row) => row.tenantId === T_OTRO);
    expect(ajena?.slug).toBe('de-otro-pc');
    expect(ajena?.deletedAt).toBeNull();
  });

  it('el roundtrip exportar e importar no produce cambios', async () => {
    seedOferta({
      baseGameSlug: 'zelda',
      platformSlug: 'pc',
      title: 'Zelda PC',
      origin: 'PERSONALIZADO',
    });
    seedOferta({
      baseGameSlug: 'elden-ring',
      platformSlug: 'ps5',
      priceMode: 'MANUAL',
      price: 69.9,
      sizeValue: 60,
      sizeUnit: 'GB',
      origin: 'PERSONALIZADO',
    });

    const exported = await rawGet(`${EXPORT}/catalog`, adminToken);
    expect(exported.status).toBe(200);

    const backupId = await createPreImportBackup();
    const { status: previewStatus, body: previewBody } = await preview(
      exported.body['offers'] as unknown[],
    );
    expect(previewStatus).toBe(200);
    const previewData = previewBody.data as PreviewData;
    expect(previewData.changes.create).toHaveLength(0);
    expect(previewData.changes.update).toEqual([]);
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