import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import type { FakeBaseGame, FakeTenantGame } from '../helpers/fakeDb.js';
import {
  addFakeBaseGame,
  addFakeBaseGameGenre,
  addFakeBaseGamePlatform,
  addFakeCategory,
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
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  error?: { code: string; message: string; details?: unknown };
}

interface TaxonomySummary {
  id: string;
  name: string;
  slug: string;
}

interface GameDto {
  id: string;
  tenantId: string;
  baseGameId: string | null;
  baseGame: { id: string; slug: string; title: string } | null;
  origin: 'BIBLIOTECA' | 'PERSONALIZADO';
  title: string;
  slug: string;
  description: string | null;
  priceMode: 'RULE' | 'MANUAL';
  price: number | null;
  availability: boolean;
  sizeValue: number;
  sizeUnit: string;
  releaseYear: number | null;
  categoryId: string | null;
  category: TaxonomySummary | null;
  genres: TaxonomySummary[];
  platforms: TaxonomySummary[];
  minimumRequirements: unknown;
  recommendedRequirements: unknown;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
}

interface MissingDetails {
  missing?: { categories?: string[]; genres?: string[]; platforms?: string[] };
  fields?: string[];
  missingIds?: string[];
}

const BASE = '/api/v1/admin/games';
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

function globalCategory(slug: string, name = 'Global') {
  return addFakeCategory({ id: randomUUID(), tenantId: null, name, slug });
}

function tenantCategory(slug: string, name = 'Tenant', tenantId = T_JAVIER) {
  return addFakeCategory({ id: randomUUID(), tenantId, name, slug });
}

function globalGenre(slug: string, name = 'Global') {
  return addFakeGenre({ id: randomUUID(), tenantId: null, name, slug });
}

function tenantGenre(slug: string, name = 'Tenant', tenantId = T_JAVIER) {
  return addFakeGenre({ id: randomUUID(), tenantId, name, slug });
}

function globalPlatform(slug: string, name = 'Global') {
  return addFakePlatform({ id: randomUUID(), tenantId: null, name, slug });
}

function tenantPlatform(slug: string, name = 'Tenant', tenantId = T_JAVIER) {
  return addFakePlatform({ id: randomUUID(), tenantId, name, slug });
}

function seedBaseGame(overrides: Partial<FakeBaseGame> = {}): FakeBaseGame {
  return addFakeBaseGame({
    id: randomUUID(),
    title: 'Hades',
    slug: 'hades',
    description: 'Roguelike mitológico',
    sizeValue: 15,
    sizeUnit: 'GB',
    releaseYear: 2020,
    categoryId: null,
    minimumRequirements: { cpu: 'i5', ram: '8 GB' },
    recommendedRequirements: { cpu: 'i7', ram: '16 GB' },
    ...overrides,
  });
}

function seedGame(overrides: Partial<FakeTenantGame> = {}): FakeTenantGame {
  return addFakeTenantGame({
    id: randomUUID(),
    tenantId: T_JAVIER,
    title: 'Juego',
    slug: `juego-${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
}

function seedPublishFixture() {
  const gCat = globalCategory('accion', 'Acción');
  const tCat = tenantCategory('accion', 'Acción');
  const gGenre = globalGenre('rpg', 'RPG');
  const tGenre = tenantGenre('rpg', 'RPG');
  const gPlat = globalPlatform('pc', 'PC');
  const tPlat = tenantPlatform('pc', 'PC');
  const base = seedBaseGame({ categoryId: gCat.id });
  addFakeBaseGameGenre(base.id, gGenre.id);
  addFakeBaseGamePlatform(base.id, gPlat.id);
  return { gCat, tCat, gGenre, tGenre, gPlat, tPlat, base };
}

function auditRow(action: string) {
  return [...state.auditLogs.values()].find(
    (row) => row.action === action && row.entity === 'TenantGame',
  );
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
  addFakeUser({ id: 'u-super', username: 'root', role: 'SUPER_ADMIN', tenantId: null });
  addFakeUser({ id: 'u-admin', username: 'javier-admin', role: 'ADMIN', tenantId: T_JAVIER });
  addFakeTenant({ id: T_JAVIER, name: 'Javier', slug: 'javier' });
  addFakeTenant({ id: T_OTRO, name: 'Otro', slug: 'otro' });
});

describe('GET /games', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(BASE);

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('lista solo el tenant de la sesión ADMIN con meta', async () => {
    seedGame({ slug: 'propio', title: 'Propio' });
    seedGame({ tenantId: T_OTRO, slug: 'ajeno', title: 'Ajeno' });

    const { status, body } = await api<GameDto[]>(BASE, {}, adminToken);

    expect(status).toBe(200);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(body.data?.[0]).toMatchObject({ slug: 'propio', tenantId: T_JAVIER });
  });

  it('excluye juegos eliminados', async () => {
    seedGame({ slug: 'activo', title: 'Activo' });
    seedGame({ slug: 'borrado', title: 'Borrado', deletedAt: new Date() });

    const { status, body } = await api<GameDto[]>(BASE, {}, adminToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(1);
    expect(body.data?.[0]?.slug).toBe('activo');
  });

  it('exige tenantId para SUPER_ADMIN', async () => {
    const { status, body } = await api(BASE, {}, superToken);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('lista el tenant indicado para SUPER_ADMIN', async () => {
    seedGame({ tenantId: T_OTRO, slug: 'ajeno', title: 'Ajeno' });

    const { status, body } = await api<GameDto[]>(`${BASE}?tenantId=${T_OTRO}`, {}, superToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(1);
    expect(body.data?.[0]?.tenantId).toBe(T_OTRO);
  });

  it('rechaza tenantId ajeno para ADMIN', async () => {
    const { status, body } = await api(`${BASE}?tenantId=${T_OTRO}`, {}, adminToken);

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('filtra q case-insensitive en title y slug', async () => {
    seedGame({ title: 'Aventura Extrema', slug: 'aventura-extrema' });
    seedGame({ title: 'Deportes', slug: 'deportes' });

    const byTitle = await api<GameDto[]>(`${BASE}?q=AVENTURA`, {}, adminToken);
    expect(byTitle.body.meta?.total).toBe(1);
    expect(byTitle.body.data?.[0]?.slug).toBe('aventura-extrema');

    const bySlug = await api<GameDto[]>(`${BASE}?q=DEPORTES`, {}, adminToken);
    expect(bySlug.body.meta?.total).toBe(1);
  });

  it('filtra por origin, availability y categoryId', async () => {
    const category = tenantCategory('rpg', 'RPG');
    seedGame({ slug: 'biblio', origin: 'BIBLIOTECA', availability: false });
    seedGame({
      slug: 'custom',
      origin: 'PERSONALIZADO',
      availability: true,
      categoryId: category.id,
    });

    const byOrigin = await api<GameDto[]>(`${BASE}?origin=BIBLIOTECA`, {}, adminToken);
    expect(byOrigin.body.meta?.total).toBe(1);
    expect(byOrigin.body.data?.[0]?.slug).toBe('biblio');

    const byAvailability = await api<GameDto[]>(`${BASE}?availability=true`, {}, adminToken);
    expect(byAvailability.body.meta?.total).toBe(1);
    expect(byAvailability.body.data?.[0]?.slug).toBe('custom');

    const byCategory = await api<GameDto[]>(`${BASE}?categoryId=${category.id}`, {}, adminToken);
    expect(byCategory.body.meta?.total).toBe(1);
  });

  it('ordena por sort title asc y desc', async () => {
    seedGame({ title: 'Zeta', slug: 'zeta' });
    seedGame({ title: 'Alfa', slug: 'alfa' });

    const asc = await api<GameDto[]>(`${BASE}?sort=title`, {}, adminToken);
    expect(asc.body.data?.map((row) => row.title)).toEqual(['Alfa', 'Zeta']);

    const desc = await api<GameDto[]>(`${BASE}?sort=-title`, {}, adminToken);
    expect(desc.body.data?.map((row) => row.title)).toEqual(['Zeta', 'Alfa']);
  });

  it('devuelve 400 con sort inválido', async () => {
    const { status } = await api(`${BASE}?sort=otro`, {}, adminToken);

    expect(status).toBe(400);
  });

  it('pagina con page y limit', async () => {
    seedGame({ slug: 'uno' });
    seedGame({ slug: 'dos' });
    seedGame({ slug: 'tres' });

    const { status, body } = await api(`${BASE}?limit=2&page=2`, {}, adminToken);

    expect(status).toBe(200);
    expect(body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(body.data).toHaveLength(1);
  });
});

describe('POST /games (personalizado)', () => {
  it('devuelve 401 sin token', async () => {
    const { status } = await api(BASE, {
      method: 'POST',
      body: JSON.stringify({ title: 'Nuevo', slug: 'nuevo', sizeValue: 1, sizeUnit: 'GB' }),
    });

    expect(status).toBe(401);
  });

  it('ADMIN crea en su tenant sin enviar tenantId, audita y copia requirements', async () => {
    const category = tenantCategory('rpg', 'RPG');
    const genre = tenantGenre('indie', 'Indie');
    const platform = tenantPlatform('pc', 'PC');

    const { status, body } = await api<GameDto>(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Mod Pack',
          slug: 'mod-pack',
          sizeValue: 500,
          sizeUnit: 'MB',
          categoryId: category.id,
          genreIds: [genre.id],
          platformIds: [platform.id],
          minimumRequirements: { cpu: 'i3', ram: '4 GB' },
          priceMode: 'MANUAL',
          price: 4.99,
        }),
      },
      adminToken,
    );

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      tenantId: T_JAVIER,
      origin: 'PERSONALIZADO',
      title: 'Mod Pack',
      slug: 'mod-pack',
      priceMode: 'MANUAL',
      price: 4.99,
      createdBy: 'u-admin',
      updatedBy: 'u-admin',
    });
    expect(body.data?.category).toMatchObject({ id: category.id });
    expect(body.data?.genres[0]).toMatchObject({ id: genre.id });
    expect(body.data?.platforms[0]).toMatchObject({ id: platform.id });
    expect(body.data?.recommendedRequirements).toEqual({ cpu: 'i3', ram: '4 GB' });

    const log = auditRow('CREATE');
    expect(log).toMatchObject({
      entity: 'TenantGame',
      entityId: body.data?.id,
      actorId: 'u-admin',
      actorRole: 'ADMIN',
      tenantId: T_JAVIER,
    });
    expect(log?.metadata).toMatchObject({ origin: 'PERSONALIZADO', slug: 'mod-pack' });
  });

  it('SUPER_ADMIN crea en el tenant indicado', async () => {
    const { status, body } = await api<GameDto>(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          tenantId: T_OTRO,
          title: 'Ajeno',
          slug: 'ajeno',
          sizeValue: 1,
          sizeUnit: 'GB',
        }),
      },
      superToken,
    );

    expect(status).toBe(201);
    expect(body.data).toMatchObject({ tenantId: T_OTRO, createdBy: 'u-super' });
  });

  it('SUPER_ADMIN recibe 400 sin tenantId', async () => {
    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Sin tenant',
          slug: 'sin-tenant',
          sizeValue: 1,
          sizeUnit: 'GB',
        }),
      },
      superToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('ADMIN recibe 403 con tenantId ajeno en el cuerpo', async () => {
    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          tenantId: T_OTRO,
          title: 'Ajeno',
          slug: 'ajeno',
          sizeValue: 1,
          sizeUnit: 'GB',
        }),
      },
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('devuelve 409 si el slug ya existe en el mismo tenant', async () => {
    seedGame({ slug: 'ocupado' });

    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Duplicado', slug: 'ocupado', sizeValue: 1, sizeUnit: 'GB' }),
      },
      adminToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('GAME_SLUG_EXISTS');
  });

  it('permite el mismo slug en otro tenant', async () => {
    seedGame({ tenantId: T_OTRO, slug: 'repetido' });

    const { status, body } = await api<GameDto>(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Propio', slug: 'repetido', sizeValue: 1, sizeUnit: 'GB' }),
      },
      adminToken,
    );

    expect(status).toBe(201);
    expect(body.data?.tenantId).toBe(T_JAVIER);
  });

  it('devuelve 422 si la categoría no pertenece al tenant', async () => {
    const foreignCategory = tenantCategory('otra', 'Otra', T_OTRO);

    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Nuevo',
          slug: 'nuevo',
          sizeValue: 1,
          sizeUnit: 'GB',
          categoryId: foreignCategory.id,
        }),
      },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('devuelve 422 si un género no pertenece al tenant', async () => {
    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Nuevo',
          slug: 'nuevo',
          sizeValue: 1,
          sizeUnit: 'GB',
          genreIds: [randomUUID()],
        }),
      },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('GENRE_NOT_FOUND');
    const details = body.error?.details as MissingDetails;
    expect(details.missingIds).toHaveLength(1);
  });

  it('devuelve 400 si faltan campos obligatorios', async () => {
    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Sin unidad', slug: 'sin-unidad', sizeValue: 10 }),
      },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si priceMode es MANUAL sin price', async () => {
    const { status } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Sin precio',
          slug: 'sin-precio',
          sizeValue: 1,
          sizeUnit: 'GB',
          priceMode: 'MANUAL',
        }),
      },
      adminToken,
    );

    expect(status).toBe(400);
  });

  it('devuelve 400 si envía price con priceMode RULE', async () => {
    const { status } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Con precio',
          slug: 'con-precio',
          sizeValue: 1,
          sizeUnit: 'GB',
          priceMode: 'RULE',
          price: 10,
        }),
      },
      adminToken,
    );

    expect(status).toBe(400);
  });
});

describe('POST /games (publicación desde biblioteca)', () => {
  it('publica mapeando taxonomía global por slug hacia el tenant', async () => {
    const fixture = seedPublishFixture();

    const { status, body } = await api<GameDto>(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({ baseGameId: fixture.base.id, priceMode: 'MANUAL', price: 19.99 }),
      },
      adminToken,
    );

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      tenantId: T_JAVIER,
      baseGameId: fixture.base.id,
      origin: 'BIBLIOTECA',
      title: 'Hades',
      slug: 'hades',
      description: 'Roguelike mitológico',
      priceMode: 'MANUAL',
      price: 19.99,
      availability: true,
      sizeValue: 15,
      sizeUnit: 'GB',
      releaseYear: 2020,
      categoryId: fixture.tCat.id,
    });
    expect(body.data?.baseGame).toMatchObject({ id: fixture.base.id, slug: 'hades' });
    expect(body.data?.category).toMatchObject({ id: fixture.tCat.id, slug: 'accion' });
    expect(body.data?.genres).toEqual([expect.objectContaining({ id: fixture.tGenre.id })]);
    expect(body.data?.platforms).toEqual([expect.objectContaining({ id: fixture.tPlat.id })]);
    expect(body.data?.minimumRequirements).toEqual({ cpu: 'i5', ram: '8 GB' });
    expect(body.data?.recommendedRequirements).toEqual({ cpu: 'i7', ram: '16 GB' });

    const bridges = [...state.tenantGameGenres.values()].filter(
      (row) => row.tenantGameId === body.data?.id,
    );
    expect(bridges.map((row) => row.genreId)).toEqual([fixture.tGenre.id]);

    const log = auditRow('CREATE');
    expect(log).toMatchObject({ entity: 'TenantGame', tenantId: T_JAVIER, actorId: 'u-admin' });
    expect(log?.metadata).toMatchObject({ origin: 'BIBLIOTECA', baseGameId: fixture.base.id });
  });

  it('respeta categoryId null explícito sin mapear ni fallar', async () => {
    const fixture = seedPublishFixture();

    const { status, body } = await api<GameDto>(
      BASE,
      { method: 'POST', body: JSON.stringify({ baseGameId: fixture.base.id, categoryId: null }) },
      adminToken,
    );

    expect(status).toBe(201);
    expect(body.data?.categoryId).toBeNull();
    expect(body.data?.category).toBeNull();
  });

  it('devuelve 422 TAXONOMY_MAPPING_INCOMPLETE si falta la equivalencia de categoría', async () => {
    const global = globalCategory('sim', 'Sim');
    const base = seedBaseGame({ categoryId: global.id });

    const { status, body } = await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ baseGameId: base.id }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('TAXONOMY_MAPPING_INCOMPLETE');
    const details = body.error?.details as MissingDetails;
    expect(details.missing?.categories).toEqual(['sim']);
  });

  it('devuelve 422 TAXONOMY_MAPPING_INCOMPLETE si falta la equivalencia de género', async () => {
    const global = globalGenre('terra', 'Terra');
    const base = seedBaseGame();
    addFakeBaseGameGenre(base.id, global.id);

    const { status, body } = await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ baseGameId: base.id }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('TAXONOMY_MAPPING_INCOMPLETE');
    const details = body.error?.details as MissingDetails;
    expect(details.missing?.genres).toEqual(['terra']);
  });

  it('devuelve 422 si la taxonomía explícita no existe en el tenant', async () => {
    const fixture = seedPublishFixture();

    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({ baseGameId: fixture.base.id, categoryId: randomUUID() }),
      },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('devuelve 422 si el juego de biblioteca no existe', async () => {
    const { status, body } = await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ baseGameId: randomUUID() }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('BASE_GAME_NOT_FOUND');
  });

  it('devuelve 409 si el juego ya está publicado en el tenant', async () => {
    const fixture = seedPublishFixture();
    seedGame({ baseGameId: fixture.base.id, slug: 'otro-slug' });

    const { status, body } = await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ baseGameId: fixture.base.id }) },
      adminToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('DUPLICATE_PUBLICATION');
  });

  it('devuelve 409 si el slug del juego ya está ocupado en el tenant', async () => {
    const fixture = seedPublishFixture();
    seedGame({ slug: 'hades', baseGameId: null });

    const { status, body } = await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ baseGameId: fixture.base.id }) },
      adminToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('GAME_SLUG_EXISTS');
  });

  it('devuelve 400 si envía campos de biblioteca al publicar', async () => {
    const fixture = seedPublishFixture();

    const { status, body } = await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ baseGameId: fixture.base.id, title: 'Hackeado' }) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /games/:id', () => {
  it('devuelve el juego con su detalle', async () => {
    const genre = tenantGenre('rpg', 'RPG');
    const game = seedGame({ title: 'Único', slug: 'unico' });
    addFakeTenantGameGenre(game.id, genre.id);

    const { status, body } = await api<GameDto>(`${BASE}/${game.id}`, {}, adminToken);

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: game.id, slug: 'unico' });
    expect(body.data?.genres[0]).toMatchObject({ id: genre.id });
  });

  it('devuelve 404 para juegos de otro tenant (ADMIN)', async () => {
    const game = seedGame({ tenantId: T_OTRO });

    const { status, body } = await api(`${BASE}/${game.id}`, {}, adminToken);

    expect(status).toBe(404);
    expect(body.error?.code).toBe('GAME_NOT_FOUND');
  });

  it('devuelve 404 si no existe', async () => {
    const { status } = await api(`${BASE}/${randomUUID()}`, {}, adminToken);

    expect(status).toBe(404);
  });

  it('devuelve 400 si el id no es uuid', async () => {
    const { status } = await api(`${BASE}/no-es-uuid`, {}, adminToken);

    expect(status).toBe(400);
  });
});

describe('PATCH /games/:id', () => {
  it('permite editar solo campos comerciales en juegos de biblioteca', async () => {
    const category = tenantCategory('rpg', 'RPG');
    const game = seedGame({
      origin: 'BIBLIOTECA',
      baseGameId: randomUUID(),
      slug: 'hades',
      title: 'Hades',
      priceMode: 'RULE',
      price: null,
      categoryId: category.id,
    });

    const { status, body } = await api<GameDto>(
      `${BASE}/${game.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ priceMode: 'MANUAL', price: 12.5, availability: false }),
      },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      origin: 'BIBLIOTECA',
      priceMode: 'MANUAL',
      price: 12.5,
      availability: false,
      updatedBy: 'u-admin',
    });
    expect(state.tenantGames.get(game.id)?.availability).toBe(false);

    const log = auditRow('UPDATE');
    expect(log).toMatchObject({ entity: 'TenantGame', entityId: game.id, actorId: 'u-admin' });
    expect(log?.metadata).toMatchObject({ fields: ['priceMode', 'price', 'availability'] });
  });

  it('bloquea title en juegos de biblioteca con LIBRARY_FIELDS_IMMUTABLE', async () => {
    const game = seedGame({ origin: 'BIBLIOTECA', baseGameId: randomUUID(), slug: 'hades' });

    const { status, body } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ title: 'Hackeado' }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('LIBRARY_FIELDS_IMMUTABLE');
    const details = body.error?.details as MissingDetails;
    expect(details.fields).toContain('title');
    expect(state.tenantGames.get(game.id)?.title).toBe('Juego');
  });

  it('bloquea slug en juegos de biblioteca', async () => {
    const game = seedGame({ origin: 'BIBLIOTECA', baseGameId: randomUUID(), slug: 'hades' });

    const { status, body } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ slug: 'otro-slug' }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('LIBRARY_FIELDS_IMMUTABLE');
    const details = body.error?.details as MissingDetails;
    expect(details.fields).toContain('slug');
  });

  it('actualiza campos de juegos personalizados y audita', async () => {
    const game = seedGame({ title: 'Viejo', slug: 'viejo' });

    const { status, body } = await api<GameDto>(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ title: 'Nuevo', slug: 'nuevo' }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ title: 'Nuevo', slug: 'nuevo', updatedBy: 'u-admin' });
    expect(state.tenantGames.get(game.id)?.slug).toBe('nuevo');
  });

  it('devuelve 409 si el slug de un personalizado ya lo usa otro', async () => {
    seedGame({ slug: 'ocupado' });
    const game = seedGame({ title: 'Otro', slug: 'otro' });

    const { status, body } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ slug: 'ocupado' }) },
      adminToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('GAME_SLUG_EXISTS');
  });

  it('devuelve 422 PRICE_REQUIRED al pasar a MANUAL sin price', async () => {
    const game = seedGame({ priceMode: 'RULE', price: null });

    const { status, body } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ priceMode: 'MANUAL' }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('PRICE_REQUIRED');
  });

  it('limpia el price al volver a RULE', async () => {
    const game = seedGame({ priceMode: 'MANUAL', price: 19.99 });

    const { status, body } = await api<GameDto>(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ priceMode: 'RULE' }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.priceMode).toBe('RULE');
    expect(body.data?.price).toBeNull();
    expect(state.tenantGames.get(game.id)?.price).toBeNull();
  });

  it('devuelve 422 PRICE_ONLY_MANUAL al enviar price en modo RULE', async () => {
    const game = seedGame({ priceMode: 'RULE', price: null });

    const { status, body } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ price: 10 }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('PRICE_ONLY_MANUAL');
  });

  it('actualiza precio manual sin cambiar priceMode', async () => {
    const game = seedGame({ priceMode: 'MANUAL', price: 19.99 });

    const { status, body } = await api<GameDto>(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ price: 25.5 }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.price).toBe(25.5);
  });

  it('devuelve 400 sin campos', async () => {
    const game = seedGame();

    const { status } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({}) },
      adminToken,
    );

    expect(status).toBe(400);
  });

  it('ADMIN no modifica juegos de otro tenant (404)', async () => {
    const game = seedGame({ tenantId: T_OTRO, title: 'Ajeno' });

    const { status, body } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ title: 'Hackeada' }) },
      adminToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('GAME_NOT_FOUND');
    expect(state.tenantGames.get(game.id)?.title).toBe('Ajeno');
  });
});

describe('DELETE /games/:id y restore', () => {
  it('elimina con soft delete, excluye de listas y audita', async () => {
    const game = seedGame({ title: 'Borrar', slug: 'borrar' });

    const { status, body } = await api<GameDto>(
      `${BASE}/${game.id}`,
      { method: 'DELETE' },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.deletedAt).toBeTruthy();
    expect(state.tenantGames.get(game.id)?.deletedBy).toBe('u-admin');

    const list = await api(BASE, {}, adminToken);
    expect(list.body.meta?.total).toBe(0);

    const log = auditRow('DELETE');
    expect(log).toMatchObject({ entity: 'TenantGame', entityId: game.id, actorId: 'u-admin' });
  });

  it('devuelve 404 si no existe', async () => {
    const { status } = await api(`${BASE}/${randomUUID()}`, { method: 'DELETE' }, adminToken);

    expect(status).toBe(404);
  });

  it('ADMIN no elimina juegos de otro tenant (404)', async () => {
    const game = seedGame({ tenantId: T_OTRO });

    const { status } = await api(`${BASE}/${game.id}`, { method: 'DELETE' }, adminToken);

    expect(status).toBe(404);
    expect(state.tenantGames.get(game.id)?.deletedAt).toBeNull();
  });

  it('restaura un juego eliminado y audita', async () => {
    const game = seedGame({ deletedAt: new Date(), deletedBy: 'u-admin' });

    const { status, body } = await api<GameDto>(
      `${BASE}/${game.id}/restore`,
      { method: 'POST' },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.deletedAt).toBeNull();
    expect(body.data?.deletedBy).toBeNull();

    const log = auditRow('RESTORE');
    expect(log).toMatchObject({ entity: 'TenantGame', entityId: game.id, actorId: 'u-admin' });
  });

  it('devuelve 409 si no está eliminado', async () => {
    const game = seedGame();

    const { status, body } = await api(
      `${BASE}/${game.id}/restore`,
      { method: 'POST' },
      adminToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('NOT_DELETED');
  });

  it('devuelve 404 al restaurar un juego inexistente', async () => {
    const { status } = await api(`${BASE}/${randomUUID()}/restore`, { method: 'POST' }, adminToken);

    expect(status).toBe(404);
  });
});

describe('visibilidad de la taxonomía global', () => {
  it('la lista de categorías del tenant no incluye filas globales', async () => {
    globalCategory('accion', 'Acción Global');
    tenantCategory('deportes', 'Deportes');

    const adminList = await api<{ slug: string }[]>('/api/v1/admin/categories', {}, adminToken);
    expect(adminList.status).toBe(200);
    expect(adminList.body.meta?.total).toBe(1);
    expect(adminList.body.data?.[0]?.slug).toBe('deportes');

    const superList = await api<{ slug: string }[]>(
      `/api/v1/admin/categories?tenantId=${T_JAVIER}`,
      {},
      superToken,
    );
    expect(superList.body.meta?.total).toBe(1);
    expect(superList.body.data?.[0]?.slug).toBe('deportes');
  });

  it('la taxonomía global no rompe la lista de juegos del tenant', async () => {
    globalCategory('accion', 'Acción Global');
    seedGame({ slug: 'propio' });

    const { status, body } = await api<GameDto[]>(BASE, {}, adminToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(1);
  });
});
