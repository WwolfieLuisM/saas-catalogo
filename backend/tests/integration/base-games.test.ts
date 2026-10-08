import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import type { FakeBaseGame } from '../helpers/fakeDb.js';
import {
  addFakeBaseGame,
  addFakeBaseGameGenre,
  addFakeBaseGamePlatform,
  addFakeCategory,
  addFakeGenre,
  addFakePlatform,
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
  error?: { code: string; message: string; details?: unknown };
}

interface BaseGameDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  sizeValue: number;
  sizeUnit: string;
  releaseYear: number | null;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  genres: { id: string; name: string; slug: string }[];
  platforms: { id: string; name: string; slug: string }[];
  minimumRequirements: unknown;
  recommendedRequirements: unknown;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
}

const BASE = '/api/v1/admin/base-games';
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

function seedGlobalCategory(overrides: Partial<Parameters<typeof addFakeCategory>[0]> = {}) {
  return addFakeCategory({
    id: randomUUID(),
    tenantId: null,
    name: 'Acción',
    slug: 'accion',
    ...overrides,
  });
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
    ...overrides,
  });
}

function auditRow(action: string) {
  return [...state.auditLogs.values()].find(
    (row) => row.action === action && row.entity === 'BaseGame',
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

describe('GET /base-games', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(BASE);

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('ADMIN puede listar la biblioteca en modo lectura', async () => {
    seedBaseGame();

    const { status, body } = await api<BaseGameDto[]>(BASE, {}, adminToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(1);
    expect(body.data?.[0]?.title).toBe('Hades');
  });

  it('SUPER_ADMIN lista la biblioteca sin tenantId', async () => {
    seedBaseGame();

    const { status, body } = await api<BaseGameDto[]>(BASE, {}, superToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(1);
  });

  it('excluye juegos eliminados', async () => {
    seedBaseGame();
    seedBaseGame({ title: 'Celeste', slug: 'celeste', deletedAt: new Date() });

    const { status, body } = await api<BaseGameDto[]>(BASE, {}, superToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(1);
    expect(body.data?.[0]?.slug).toBe('hades');
  });

  it('filtra q case-insensitive en title y slug', async () => {
    seedBaseGame({ title: 'Aventura Extrema', slug: 'aventura-extrema' });
    seedBaseGame({ title: 'Deportes', slug: 'deportes' });

    const byTitle = await api<BaseGameDto[]>(`${BASE}?q=AVENTURA`, {}, superToken);
    expect(byTitle.body.meta?.total).toBe(1);
    expect(byTitle.body.data?.[0]?.slug).toBe('aventura-extrema');

    const bySlug = await api<BaseGameDto[]>(`${BASE}?q=DEPORTES`, {}, superToken);
    expect(bySlug.body.meta?.total).toBe(1);
  });

  it('filtra por categoryId', async () => {
    const category = seedGlobalCategory();
    seedBaseGame({ categoryId: category.id });
    seedBaseGame({ title: 'Celeste', slug: 'celeste' });

    const { status, body } = await api<BaseGameDto[]>(
      `${BASE}?categoryId=${category.id}`,
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(1);
    expect(body.data?.[0]?.slug).toBe('hades');
  });

  it('ordena por sort title asc y desc', async () => {
    seedBaseGame({ title: 'Zeta', slug: 'zeta' });
    seedBaseGame({ title: 'Alfa', slug: 'alfa' });

    const asc = await api<BaseGameDto[]>(`${BASE}?sort=title`, {}, superToken);
    expect(asc.body.data?.map((row) => row.title)).toEqual(['Alfa', 'Zeta']);

    const desc = await api<BaseGameDto[]>(`${BASE}?sort=-title`, {}, superToken);
    expect(desc.body.data?.map((row) => row.title)).toEqual(['Zeta', 'Alfa']);
  });

  it('devuelve 400 con sort inválido', async () => {
    const { status, body } = await api(`${BASE}?sort=otro`, {}, superToken);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('pagina con page y limit', async () => {
    seedBaseGame({ slug: 'uno' });
    seedBaseGame({ slug: 'dos' });
    seedBaseGame({ slug: 'tres' });

    const { status, body } = await api(`${BASE}?limit=2&page=2`, {}, superToken);

    expect(status).toBe(200);
    expect(body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(body.data).toHaveLength(1);
  });
});

describe('POST /base-games', () => {
  it('devuelve 401 sin token', async () => {
    const { status } = await api(BASE, {
      method: 'POST',
      body: JSON.stringify({ title: 'Nuevo', slug: 'nuevo', sizeValue: 1, sizeUnit: 'GB' }),
    });

    expect(status).toBe(401);
  });

  it('ADMIN no puede crear juegos de biblioteca (403)', async () => {
    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Nuevo', slug: 'nuevo', sizeValue: 1, sizeUnit: 'GB' }),
      },
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('SUPER_ADMIN crea con taxonomía global, puentes y auditoría', async () => {
    const category = seedGlobalCategory();
    const genre = addFakeGenre({ id: randomUUID(), tenantId: null, name: 'RPG', slug: 'rpg' });
    const platform = addFakePlatform({ id: randomUUID(), tenantId: null, name: 'PC', slug: 'pc' });

    const { status, body } = await api<BaseGameDto>(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Hades',
          slug: 'hades',
          description: 'Roguelike mitológico',
          sizeValue: 15,
          sizeUnit: 'GB',
          releaseYear: 2020,
          categoryId: category.id,
          genreIds: [genre.id],
          platformIds: [platform.id],
          minimumRequirements: { cpu: 'i5', ram: '8 GB' },
        }),
      },
      superToken,
    );

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      title: 'Hades',
      slug: 'hades',
      sizeValue: 15,
      sizeUnit: 'GB',
      categoryId: category.id,
      createdBy: 'u-super',
      updatedBy: 'u-super',
      deletedAt: null,
    });
    expect(body.data?.category).toMatchObject({ slug: 'accion' });
    expect(body.data?.genres).toHaveLength(1);
    expect(body.data?.platforms).toHaveLength(1);
    expect(body.data?.recommendedRequirements).toEqual({ cpu: 'i5', ram: '8 GB' });

    const log = auditRow('CREATE');
    expect(log).toMatchObject({
      entity: 'BaseGame',
      entityId: body.data?.id,
      actorId: 'u-super',
      actorRole: 'SUPER_ADMIN',
      tenantId: null,
    });
    expect(log?.metadata).toMatchObject({ title: 'Hades', slug: 'hades' });
  });

  it('devuelve 422 si la categoría no existe en la biblioteca', async () => {
    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Nuevo',
          slug: 'nuevo',
          sizeValue: 1,
          sizeUnit: 'GB',
          categoryId: randomUUID(),
        }),
      },
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('devuelve 422 si un género no existe en la biblioteca', async () => {
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
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('GENRE_NOT_FOUND');
  });

  it('devuelve 409 si el slug ya existe (incluso eliminado)', async () => {
    seedBaseGame({ slug: 'ocupado', deletedAt: new Date() });

    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Duplicado', slug: 'ocupado', sizeValue: 1, sizeUnit: 'GB' }),
      },
      superToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('BASE_GAME_SLUG_EXISTS');
  });

  it('devuelve 400 con slug inválido', async () => {
    const { status, body } = await api(
      BASE,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Malo',
          slug: 'Slug Invalido',
          sizeValue: 1,
          sizeUnit: 'GB',
        }),
      },
      superToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 sin campos obligatorios', async () => {
    const { status } = await api(
      BASE,
      { method: 'POST', body: JSON.stringify({ slug: 'sin-campos' }) },
      superToken,
    );

    expect(status).toBe(400);
  });
});

describe('GET /base-games/:id', () => {
  it('devuelve el juego con su taxonomía global', async () => {
    const category = seedGlobalCategory();
    const genre = addFakeGenre({ id: randomUUID(), tenantId: null, name: 'RPG', slug: 'rpg' });
    const game = seedBaseGame({ categoryId: category.id });
    addFakeBaseGameGenre(game.id, genre.id);

    const { status, body } = await api<BaseGameDto>(`${BASE}/${game.id}`, {}, superToken);

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: game.id, slug: 'hades' });
    expect(body.data?.category).toMatchObject({ slug: 'accion' });
    expect(body.data?.genres[0]).toMatchObject({ slug: 'rpg' });
  });

  it('devuelve 404 si no existe', async () => {
    const { status, body } = await api(`${BASE}/${randomUUID()}`, {}, superToken);

    expect(status).toBe(404);
    expect(body.error?.code).toBe('BASE_GAME_NOT_FOUND');
  });

  it('devuelve 400 si el id no es uuid', async () => {
    const { status } = await api(`${BASE}/no-es-uuid`, {}, superToken);

    expect(status).toBe(400);
  });

  it('devuelve 404 si está eliminado', async () => {
    const game = seedBaseGame({ deletedAt: new Date() });

    const { status } = await api(`${BASE}/${game.id}`, {}, superToken);

    expect(status).toBe(404);
  });
});

describe('PATCH /base-games/:id', () => {
  it('actualiza metadatos y audita', async () => {
    const game = seedBaseGame();

    const { status, body } = await api<BaseGameDto>(
      `${BASE}/${game.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Hades II', releaseYear: 2024 }),
      },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ title: 'Hades II', releaseYear: 2024, updatedBy: 'u-super' });
    expect(state.baseGames.get(game.id)?.title).toBe('Hades II');

    const log = auditRow('UPDATE');
    expect(log).toMatchObject({ entity: 'BaseGame', entityId: game.id, actorId: 'u-super' });
    expect(log?.metadata).toMatchObject({ fields: ['title', 'releaseYear'] });
  });

  it('devuelve 409 si el slug ya lo usa otro juego', async () => {
    seedBaseGame({ slug: 'ocupado' });
    const game = seedBaseGame({ title: 'Otro', slug: 'otro' });

    const { status, body } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ slug: 'ocupado' }) },
      superToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('BASE_GAME_SLUG_EXISTS');
  });

  it('devuelve 400 sin campos', async () => {
    const game = seedBaseGame();

    const { status } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({}) },
      superToken,
    );

    expect(status).toBe(400);
  });

  it('reemplaza los puentes de géneros y plataformas', async () => {
    const genreA = addFakeGenre({ id: randomUUID(), tenantId: null, name: 'RPG', slug: 'rpg' });
    const genreB = addFakeGenre({ id: randomUUID(), tenantId: null, name: 'Indie', slug: 'indie' });
    const platform = addFakePlatform({ id: randomUUID(), tenantId: null, name: 'PC', slug: 'pc' });
    const game = seedBaseGame();
    addFakeBaseGameGenre(game.id, genreA.id);
    addFakeBaseGamePlatform(game.id, platform.id);

    const { status, body } = await api<BaseGameDto>(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ genreIds: [genreB.id] }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data?.genres).toHaveLength(1);
    expect(body.data?.genres[0]).toMatchObject({ slug: 'indie' });
    expect(
      [...state.baseGameGenres.values()].filter((row) => row.baseGameId === game.id),
    ).toHaveLength(1);
  });

  it('permite limpiar la categoría con null', async () => {
    const category = seedGlobalCategory();
    const game = seedBaseGame({ categoryId: category.id });

    const { status, body } = await api<BaseGameDto>(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ categoryId: null }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data?.categoryId).toBeNull();
    expect(body.data?.category).toBeNull();
  });

  it('devuelve 422 con categoryId inválida', async () => {
    const game = seedBaseGame();

    const { status, body } = await api(
      `${BASE}/${game.id}`,
      { method: 'PATCH', body: JSON.stringify({ categoryId: randomUUID() }) },
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('devuelve 404 si no existe', async () => {
    const { status } = await api(
      `${BASE}/${randomUUID()}`,
      { method: 'PATCH', body: JSON.stringify({ title: 'Nuevo' }) },
      superToken,
    );

    expect(status).toBe(404);
  });
});

describe('DELETE /base-games/:id', () => {
  it('elimina con soft delete, excluye de listas y audita', async () => {
    const game = seedBaseGame();

    const { status, body } = await api<BaseGameDto>(
      `${BASE}/${game.id}`,
      { method: 'DELETE' },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data?.deletedAt).toBeTruthy();
    expect(state.baseGames.get(game.id)?.deletedBy).toBe('u-super');

    const list = await api(BASE, {}, superToken);
    expect(list.body.meta?.total).toBe(0);

    const log = auditRow('DELETE');
    expect(log).toMatchObject({ entity: 'BaseGame', entityId: game.id, actorId: 'u-super' });
  });

  it('devuelve 404 si ya está eliminado', async () => {
    const game = seedBaseGame({ deletedAt: new Date() });

    const { status } = await api(`${BASE}/${game.id}`, { method: 'DELETE' }, superToken);

    expect(status).toBe(404);
  });

  it('devuelve 404 si no existe', async () => {
    const { status } = await api(`${BASE}/${randomUUID()}`, { method: 'DELETE' }, superToken);

    expect(status).toBe(404);
  });
});

describe('POST /base-games/:id/restore', () => {
  it('restaura un juego eliminado y audita', async () => {
    const game = seedBaseGame({ deletedAt: new Date(), deletedBy: 'u-super' });

    const { status, body } = await api<BaseGameDto>(
      `${BASE}/${game.id}/restore`,
      { method: 'POST' },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data?.deletedAt).toBeNull();
    expect(state.baseGames.get(game.id)?.deletedBy).toBeNull();

    const log = auditRow('RESTORE');
    expect(log).toMatchObject({ entity: 'BaseGame', entityId: game.id, actorId: 'u-super' });
  });

  it('devuelve 409 si no está eliminado', async () => {
    const game = seedBaseGame();

    const { status, body } = await api(
      `${BASE}/${game.id}/restore`,
      { method: 'POST' },
      superToken,
    );

    expect(status).toBe(409);
    expect(body.error?.code).toBe('NOT_DELETED');
  });

  it('devuelve 404 si no existe', async () => {
    const { status } = await api(`${BASE}/${randomUUID()}/restore`, { method: 'POST' }, superToken);

    expect(status).toBe(404);
  });
});
