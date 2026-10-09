import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import type { FakeGameMedia, FakeTenantGame } from '../helpers/fakeDb.js';
import {
  addFakeCatalogMetadata,
  addFakeCategory,
  addFakeGameMedia,
  addFakeGamePlatform,
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
  const { fakeDb } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => fakeDb, closePrisma: async () => undefined };
});

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface CatalogGameDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number | null;
  currency: 'CUP';
  availability: boolean;
  size: { value: number; unit: 'MB' | 'GB' | 'TB'; formatted: string };
  releaseYear: number | null;
  category: { id: string; name: string } | null;
  genres: { id: string; name: string }[];
  platforms: { id: string; name: string }[];
  coverImage: { url: string; alt: string } | null;
  screenshots: { url: string }[];
  requirements: { minimum: unknown; recommended: unknown };
}

interface CatalogDto {
  version: number;
  updatedAt: string | null;
  games: CatalogGameDto[];
}

interface VersionDto {
  version: number;
  updatedAt: string | null;
}

interface SyncChangedDto extends CatalogDto {
  changed: true;
}

interface SyncUnchangedDto {
  changed: false;
  version: number;
  updatedAt: string | null;
}

const CATALOG = '/api/v1/catalog';
const GAMES = '/api/v1/admin/games';
const GENRES = '/api/v1/admin/genres';
const PRICING = '/api/v1/admin/pricing';
const T_JAVIER = '11111111-1111-4111-8111-111111111111';
const T_OTRO = '22222222-2222-4222-8222-222222222222';

let server: Server;
let baseUrl: string;
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

  return { status: response.status, body, headers: response.headers };
}

async function raw(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init);
}

function seedCatalog(version: number, tenantId = T_JAVIER) {
  return addFakeCatalogMetadata({ id: randomUUID(), tenantId, version });
}

function seedGame(overrides: Partial<FakeTenantGame> = {}): FakeTenantGame {
  return addFakeTenantGame({
    id: randomUUID(),
    tenantId: T_JAVIER,
    title: 'Juego Catálogo',
    slug: `catalogo-${randomUUID().slice(0, 8)}`,
    description: 'Descripción pública',
    sizeValue: 5,
    sizeUnit: 'GB',
    releaseYear: 2021,
    minimumRequirements: { cpu: 'i5', ram: '8 GB' },
    recommendedRequirements: { cpu: 'i7', ram: '16 GB' },
    ...overrides,
  });
}

function seedMedia(overrides: Partial<FakeGameMedia> & { gameId: string }): FakeGameMedia {
  return addFakeGameMedia({
    id: randomUUID(),
    tenantId: T_JAVIER,
    kind: 'SHOT',
    url: 'https://cdn.test/shot.png',
    ...overrides,
  });
}

async function fetchCatalog(): Promise<CatalogDto> {
  const { status, body } = await api<CatalogDto>(`${CATALOG}/?tenant=javier`);
  expect(status).toBe(200);
  return body.data as CatalogDto;
}

async function currentVersion(): Promise<number> {
  const { body } = await api<VersionDto>(`${CATALOG}/version?tenant=javier`);
  return (body.data as VersionDto).version;
}

function createGameBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    title: 'Nuevo Juego',
    slug: `nuevo-${randomUUID().slice(0, 8)}`,
    sizeValue: 12,
    sizeUnit: 'GB',
    ...overrides,
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
  adminToken = await signAccessToken({ id: 'u-admin', role: 'ADMIN', tenantId: T_JAVIER });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetFakeDb();
  addFakeUser({ id: 'u-super', username: 'root', role: 'SUPER_ADMIN', tenantId: null });
  addFakeUser({ id: 'u-admin', username: 'javier-admin', role: 'ADMIN', tenantId: T_JAVIER });
  addFakeTenant({ id: T_JAVIER, name: 'Javier', slug: 'javier' });
  addFakeTenant({ id: T_OTRO, name: 'Otro', slug: 'otro' });
});

describe('catálogo: validación de parámetros', () => {
  it('devuelve 400 si falta tenant en /version', async () => {
    const { status, body } = await api(`${CATALOG}/version`);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si falta tenant en /', async () => {
    const { status, body } = await api(`${CATALOG}/`);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si falta tenant en /sync', async () => {
    const { status, body } = await api(`${CATALOG}/sync`);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si tenant está vacío', async () => {
    const { status, body } = await api(`${CATALOG}/?tenant=`);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza explícitamente el parámetro tenantId', async () => {
    const { status, body } = await api(`${CATALOG}/?tenant=javier&tenantId=${T_JAVIER}`);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si since no es un entero', async () => {
    const { status, body } = await api(`${CATALOG}/sync?tenant=javier&since=abc`);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 404 si el slug no existe en los tres endpoints', async () => {
    for (const path of [`${CATALOG}/version`, `${CATALOG}/`, `${CATALOG}/sync`]) {
      const { status, body } = await api(`${path}?tenant=inexistente`);

      expect(status).toBe(404);
      expect(body.error?.code).toBe('TENANT_NOT_FOUND');
    }
  });

  it('devuelve 404 si el tenant está inactivo', async () => {
    addFakeTenant({
      id: randomUUID(),
      name: 'Inactivo',
      slug: 'inactivo',
      isActive: false,
    });

    const { status, body } = await api(`${CATALOG}/?tenant=inactivo`);

    expect(status).toBe(404);
    expect(body.error?.code).toBe('TENANT_NOT_FOUND');
  });
});

describe('catálogo: aislamiento de datos', () => {
  it('solo incluye juegos del tenant del slug', async () => {
    const mine = seedGame({ title: 'Mío' });
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_OTRO,
      title: 'Ajeno',
      slug: `ajeno-${randomUUID().slice(0, 8)}`,
      sizeValue: 1,
      sizeUnit: 'GB',
    });

    const data = await fetchCatalog();

    expect(data.games.map((game) => game.id)).toEqual([mine.id]);
  });

  it('excluye juegos con availability=false', async () => {
    const visible = seedGame({ title: 'Visible' });
    seedGame({ title: 'Oculto', availability: false });

    const data = await fetchCatalog();

    expect(data.games.map((game) => game.id)).toEqual([visible.id]);
  });

  it('excluye juegos eliminados', async () => {
    const activo = seedGame({ title: 'Activo' });
    seedGame({ title: 'Borrado', deletedAt: new Date() });

    const data = await fetchCatalog();

    expect(data.games.map((game) => game.id)).toEqual([activo.id]);
  });
});

describe('catálogo: forma pública §69', () => {
  it('expone exactamente los campos públicos del DTO', async () => {
    seedGame();

    const data = await fetchCatalog();
    const game = data.games[0] as CatalogGameDto;

    expect(Object.keys(game).sort()).toEqual([
      'availability',
      'category',
      'coverImage',
      'currency',
      'description',
      'genres',
      'id',
      'platforms',
      'price',
      'releaseYear',
      'requirements',
      'screenshots',
      'size',
      'slug',
      'title',
    ]);
    expect(Object.keys(game.size).sort()).toEqual(['formatted', 'unit', 'value']);
    expect(Object.keys(game.requirements).sort()).toEqual(['minimum', 'recommended']);
  });

  it('nunca expone tenantId, priceMode, origin ni campos internos', async () => {
    seedGame();

    const data = await fetchCatalog();
    const raw = JSON.stringify(data.games);

    for (const forbidden of [
      'tenantId',
      'priceMode',
      '"origin"',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'createdBy',
      'updatedBy',
      'baseGameId',
      'minimumRequirements',
      'audit',
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('normaliza price a número con currency CUP y price null cuando no aplica', async () => {
    const manualSlug = `manual-${randomUUID().slice(0, 8)}`;
    const nullSlug = `sin-precio-${randomUUID().slice(0, 8)}`;
    seedGame({ slug: manualSlug, priceMode: 'MANUAL', price: 75.5 });
    seedGame({ slug: nullSlug, price: null });

    const data = await fetchCatalog();
    const bySlug = new Map(data.games.map((game) => [game.slug, game]));
    const manual = bySlug.get(manualSlug);
    const sinPrecio = bySlug.get(nullSlug);

    expect(manual?.price).toBe(75.5);
    expect(typeof manual?.price).toBe('number');
    expect(manual?.currency).toBe('CUP');
    expect(sinPrecio?.price).toBeNull();
    expect(sinPrecio?.currency).toBe('CUP');
  });

  it('arma size con value, unit y formatted', async () => {
    seedGame({ sizeValue: 2048, sizeUnit: 'MB' });

    const data = await fetchCatalog();

    expect(data.games[0]?.size).toEqual({ value: 2048, unit: 'MB', formatted: '2048 MB' });
  });

  it('arma category y refs de genres/platforms como {id, name}', async () => {
    const category = addFakeTenantCategory();
    const genre = addFakeTenantGenre();
    const platform = addFakeTenantPlatform();
    const game = seedGame({ categoryId: category.id });
    addFakeTenantGameGenre(game.id, genre.id);
    addFakeGamePlatform(game.id, platform.id);

    const data = await fetchCatalog();
    const dto = data.games[0] as CatalogGameDto;

    expect(dto.category).toEqual({ id: category.id, name: category.name });
    expect(dto.genres).toEqual([{ id: genre.id, name: genre.name }]);
    expect(dto.platforms).toEqual([{ id: platform.id, name: platform.name }]);
  });

  it('arma coverImage con alt del título y screenshots ordenados solo con status OK', async () => {
    const game = seedGame({ title: 'Con Medios' });
    seedMedia({ gameId: game.id, kind: 'COVER', url: 'https://cdn.test/cover.png' });
    seedMedia({ gameId: game.id, kind: 'SHOT', url: 'https://cdn.test/2.png', sortOrder: 2 });
    seedMedia({ gameId: game.id, kind: 'SHOT', url: 'https://cdn.test/1.png', sortOrder: 1 });
    seedMedia({
      gameId: game.id,
      kind: 'SHOT',
      url: 'https://cdn.test/falla.png',
      status: 'ERROR',
    });

    const data = await fetchCatalog();
    const dto = data.games[0] as CatalogGameDto;

    expect(dto.coverImage).toEqual({ url: 'https://cdn.test/cover.png', alt: 'Con Medios' });
    expect(dto.screenshots.map((shot) => shot.url)).toEqual([
      'https://cdn.test/1.png',
      'https://cdn.test/2.png',
    ]);
  });

  it('arma coverImage null cuando no hay cover', async () => {
    const game = seedGame();
    seedMedia({ gameId: game.id, kind: 'SHOT', url: 'https://cdn.test/solo-shot.png' });

    const data = await fetchCatalog();

    expect(data.games[0]?.coverImage).toBeNull();
  });

  it('arma requirements desde minimum/recommended y usa {} si faltan', async () => {
    const conReqSlug = `con-req-${randomUUID().slice(0, 8)}`;
    const sinReqSlug = `sin-req-${randomUUID().slice(0, 8)}`;
    seedGame({ slug: conReqSlug });
    seedGame({ slug: sinReqSlug, minimumRequirements: null, recommendedRequirements: null });

    const data = await fetchCatalog();
    const bySlug = new Map(data.games.map((game) => [game.slug, game]));

    expect(bySlug.get(conReqSlug)?.requirements).toEqual({
      minimum: { cpu: 'i5', ram: '8 GB' },
      recommended: { cpu: 'i7', ram: '16 GB' },
    });
    expect(bySlug.get(sinReqSlug)?.requirements).toEqual({ minimum: {}, recommended: {} });
  });
});

describe('catálogo: orden y taxonomía', () => {
  it('ordena juegos por createdAt asc y luego id asc', async () => {
    const primero = seedGame({ id: 'aaaaaaaa-0000-4000-8000-000000000001' });
    const segundo = seedGame({ id: 'aaaaaaaa-0000-4000-8000-000000000002' });
    const tercero = seedGame({ id: 'aaaaaaaa-0000-4000-8000-000000000003' });
    state.tenantGames.get(segundo.id)!.createdAt = new Date('2024-01-02');
    state.tenantGames.get(tercero.id)!.createdAt = new Date('2024-01-03');
    state.tenantGames.get(primero.id)!.createdAt = new Date('2024-01-01');

    const data = await fetchCatalog();

    expect(data.games.map((game) => game.id)).toEqual([primero.id, segundo.id, tercero.id]);
  });

  it('ignora taxonomía eliminada y muestra null en category', async () => {
    const deleted = addFakeTenantCategory();
    const genre = addFakeTenantGenre();
    const platform = addFakeTenantPlatform();
    state.categories.get(deleted.id)!.deletedAt = new Date();
    state.genres.get(genre.id)!.deletedAt = new Date();
    state.platforms.get(platform.id)!.deletedAt = new Date();
    const game = seedGame({ categoryId: deleted.id });
    addFakeTenantGameGenre(game.id, genre.id);
    addFakeGamePlatform(game.id, platform.id);

    const data = await fetchCatalog();
    const dto = data.games[0] as CatalogGameDto;

    expect(dto.category).toBeNull();
    expect(dto.genres).toEqual([]);
    expect(dto.platforms).toEqual([]);
  });

  it('muestra category null si el juego no tiene categoría', async () => {
    seedGame();

    const data = await fetchCatalog();

    expect(data.games[0]?.category).toBeNull();
  });
});

describe('catálogo: ETag y caché', () => {
  it('devuelve ETag "vN" y Cache-Control: no-cache en /version', async () => {
    seedCatalog(7);

    const response = await raw(`${CATALOG}/version?tenant=javier`);

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"v7"');
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('devuelve ETag "vN" y Cache-Control: no-cache en /', async () => {
    seedCatalog(3);

    const response = await raw(`${CATALOG}/?tenant=javier`);

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"v3"');
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('responde 304 sin cuerpo en / cuando If-None-Match coincide', async () => {
    seedCatalog(5);

    const response = await raw(`${CATALOG}/?tenant=javier`, {
      headers: { 'if-none-match': '"v5"' },
    });

    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
  });

  it('responde 304 en /version con If-None-Match y conserva el ETag', async () => {
    seedCatalog(2);

    const response = await raw(`${CATALOG}/version?tenant=javier`, {
      headers: { 'if-none-match': '"v2"' },
    });

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"v2"');
  });

  it('responde 200 si el If-None-Match está desactualizado', async () => {
    seedCatalog(4);

    const response = await raw(`${CATALOG}/?tenant=javier`, {
      headers: { 'if-none-match': '"v1"' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"v4"');
  });

  it('invalida el ETag cuando la versión cambia tras una operación', async () => {
    seedCatalog(1);
    const first = await raw(`${CATALOG}/version?tenant=javier`);
    expect(first.headers.get('etag')).toBe('"v1"');

    const created = await api(`${GAMES}`, { method: 'POST', body: createGameBody() }, adminToken);
    expect(created.status).toBeLessThan(300);

    const second = await raw(`${CATALOG}/version?tenant=javier`, {
      headers: { 'if-none-match': '"v1"' },
    });
    expect(second.status).toBe(200);
    expect(second.headers.get('etag')).toBe('"v2"');
  });

  it('no envía ETag en /sync', async () => {
    seedCatalog(1);

    const response = await raw(`${CATALOG}/sync?tenant=javier&since=0`);

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });
});

describe('catálogo: /sync', () => {
  it('responde changed=false sin games cuando since coincide con version', async () => {
    seedCatalog(9);

    const { status, body } = await api<SyncUnchangedDto>(`${CATALOG}/sync?tenant=javier&since=9`);

    expect(status).toBe(200);
    const data = body.data as SyncUnchangedDto;
    expect(data.changed).toBe(false);
    expect(data.version).toBe(9);
    expect(data.updatedAt).toBeDefined();
    expect(data).not.toHaveProperty('games');
  });

  it('responde changed=true con el snapshot completo cuando since difiere', async () => {
    seedCatalog(4);
    const game = seedGame();

    const { status, body } = await api<SyncChangedDto>(`${CATALOG}/sync?tenant=javier&since=3`);

    expect(status).toBe(200);
    const data = body.data as SyncChangedDto;
    expect(data.changed).toBe(true);
    expect(data.version).toBe(4);
    expect(data.games.map((item) => item.id)).toEqual([game.id]);
  });

  it('responde changed=true con snapshot completo si no envía since', async () => {
    seedCatalog(2);
    const game = seedGame();

    const { body } = await api<SyncChangedDto>(`${CATALOG}/sync?tenant=javier`);
    const data = body.data as SyncChangedDto;

    expect(data.changed).toBe(true);
    expect(data.version).toBe(2);
    expect(data.games).toHaveLength(1);
    expect(data.games[0]?.id).toBe(game.id);
  });

  it('responde changed=false cuando version es 0 y since es 0', async () => {
    const { body } = await api<SyncUnchangedDto>(`${CATALOG}/sync?tenant=javier&since=0`);
    const data = body.data as SyncUnchangedDto;

    expect(data.changed).toBe(false);
    expect(data.version).toBe(0);
    expect(data.updatedAt).toBeNull();
  });

  it('devuelve el snapshot si since supera la versión actual', async () => {
    seedCatalog(1);
    const game = seedGame();

    const { body } = await api<SyncChangedDto>(`${CATALOG}/sync?tenant=javier&since=999`);
    const data = body.data as SyncChangedDto;

    expect(data.changed).toBe(true);
    expect(data.version).toBe(1);
    expect(data.games.map((item) => item.id)).toEqual([game.id]);
  });
});

describe('catálogo: versionado', () => {
  it('devuelve version 0 y updatedAt null si no hay metadata', async () => {
    const { status, body } = await api<VersionDto>(`${CATALOG}/version?tenant=javier`);

    expect(status).toBe(200);
    expect(body.data).toEqual({ version: 0, updatedAt: null });
  });

  it('devuelve la versión sembrada', async () => {
    seedCatalog(5);

    const data = await api<VersionDto>(`${CATALOG}/version?tenant=javier`);
    expect((data.body.data as VersionDto).version).toBe(5);
  });

  it('crea la metadata con version 1 en el primer bump', async () => {
    expect(await currentVersion()).toBe(0);

    const created = await api(`${GAMES}`, { method: 'POST', body: createGameBody() }, adminToken);
    expect(created.status).toBeLessThan(300);

    expect(await currentVersion()).toBe(1);
  });

  it('incrementa la versión al crear un juego visible', async () => {
    seedCatalog(1);

    const created = await api(`${GAMES}`, { method: 'POST', body: createGameBody() }, adminToken);
    expect(created.status).toBeLessThan(300);

    expect(await currentVersion()).toBe(2);
  });

  it('no incrementa la versión al crear un juego oculto', async () => {
    seedCatalog(1);

    const created = await api(
      `${GAMES}`,
      { method: 'POST', body: createGameBody({ availability: false }) },
      adminToken,
    );
    expect(created.status).toBeLessThan(300);

    expect(await currentVersion()).toBe(1);
  });

  it('incrementa la versión al publicar un juego oculto con PATCH', async () => {
    const hidden = seedGame({ availability: false });
    seedCatalog(3);

    const patched = await api(
      `${GAMES}/${hidden.id}`,
      { method: 'PATCH', body: JSON.stringify({ availability: true }) },
      adminToken,
    );
    expect(patched.status).toBe(200);

    expect(await currentVersion()).toBe(4);
  });

  it('no incrementa si PATCH no cambia el estado público', async () => {
    const hidden = seedGame({ availability: false });
    seedCatalog(3);

    const patched = await api(
      `${GAMES}/${hidden.id}`,
      { method: 'PATCH', body: JSON.stringify({ availability: false }) },
      adminToken,
    );
    expect(patched.status).toBe(200);

    expect(await currentVersion()).toBe(3);
  });

  it('incrementa la versión al eliminar un juego visible', async () => {
    const game = seedGame();
    seedCatalog(2);

    const deleted = await api(`${GAMES}/${game.id}`, { method: 'DELETE' }, adminToken);
    expect(deleted.status).toBeLessThan(300);

    expect(await currentVersion()).toBe(3);
  });

  it('no incrementa al eliminar un juego oculto', async () => {
    const game = seedGame({ availability: false });
    seedCatalog(2);

    const deleted = await api(`${GAMES}/${game.id}`, { method: 'DELETE' }, adminToken);
    expect(deleted.status).toBeLessThan(300);

    expect(await currentVersion()).toBe(2);
  });

  it('incrementa la versión al crear taxonomía tenant', async () => {
    seedCatalog(1);

    const created = await api(
      `${GENRES}`,
      { method: 'POST', body: JSON.stringify({ name: 'Aventura', slug: 'aventura' }) },
      adminToken,
    );
    expect(created.status).toBeLessThan(300);

    expect(await currentVersion()).toBe(2);
  });

  it('no incrementa si solo cambia la descripción de taxonomía', async () => {
    seedCatalog(6);

    const created = await api(
      `${GENRES}`,
      { method: 'POST', body: JSON.stringify({ name: 'Roguelike', slug: 'roguelike' }) },
      adminToken,
    );
    expect(created.status).toBeLessThan(300);
    const genreId = (created.body.data as { id: string }).id;
    expect(await currentVersion()).toBe(7);

    const patched = await api(
      `${GENRES}/${genreId}`,
      { method: 'PATCH', body: JSON.stringify({ description: 'Solo descripción' }) },
      adminToken,
    );
    expect(patched.status).toBe(200);

    expect(await currentVersion()).toBe(7);
  });

  it('no incrementa al crear una regla de precio', async () => {
    seedCatalog(4);

    const created = await api(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify({ minSize: 1, maxSize: 10, price: 40 }) },
      adminToken,
    );
    expect(created.status).toBeLessThan(300);

    expect(await currentVersion()).toBe(4);
  });
});

function addFakeTenantCategory() {
  return addFakeCategory({
    id: randomUUID(),
    tenantId: T_JAVIER,
    name: 'Acción',
    slug: `accion-${randomUUID().slice(0, 8)}`,
  });
}

function addFakeTenantGenre() {
  return addFakeGenre({
    id: randomUUID(),
    tenantId: T_JAVIER,
    name: 'RPG',
    slug: `rpg-${randomUUID().slice(0, 8)}`,
  });
}

function addFakeTenantPlatform() {
  return addFakePlatform({
    id: randomUUID(),
    tenantId: T_JAVIER,
    name: 'PC',
    slug: `pc-${randomUUID().slice(0, 8)}`,
  });
}
