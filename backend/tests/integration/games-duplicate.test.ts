import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakeBaseGame,
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
  const { fakeDb: db } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => db, closePrisma: async () => undefined };
});

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface GameDto {
  id: string;
  tenantId: string;
  baseGameId: string | null;
  origin: string;
  title: string;
  slug: string;
  availability: boolean;
  sizeValue: number;
  sizeUnit: string;
  deletedAt: string | null;
  genres: { id: string }[];
  platforms: { id: string }[];
}

const GAMES = '/api/v1/admin/games';
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

function seedGame(overrides: Partial<Parameters<typeof addFakeTenantGame>[0]> = {}) {
  return addFakeTenantGame({
    id: randomUUID(),
    tenantId: T_JAVIER,
    title: 'Aventura',
    slug: `aventura-${randomUUID().slice(0, 8)}`,
    description: 'Descripción',
    sizeValue: 5,
    sizeUnit: 'GB',
    ...overrides,
  });
}

async function duplicate(id: string, token = adminToken) {
  return api<GameDto>(`${GAMES}/${id}/duplicate`, { method: 'POST' }, token);
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

describe('POST /api/v1/admin/games/:id/duplicate', () => {
  it('devuelve 401 sin token', async () => {
    const game = seedGame();

    const { status, body } = await api(`${GAMES}/${game.id}/duplicate`, { method: 'POST' });

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('crea una copia con nueva entidad, slug -copia y taxonomía heredada', async () => {
    const genre = addFakeGenre({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'RPG',
      slug: 'rpg-copy',
    });
    const platform = addFakePlatform({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'PC',
      slug: 'pc-copy',
    });
    const game = seedGame({ title: 'Original', slug: 'original-x' });
    addFakeTenantGameGenre(game.id, genre.id);
    addFakeGamePlatform(game.id, platform.id);

    const { status, body } = await duplicate(game.id);

    expect(status).toBe(201);
    const copy = body.data as GameDto;
    expect(copy.id).not.toBe(game.id);
    expect(copy).toMatchObject({
      tenantId: T_JAVIER,
      title: 'Original (copia)',
      slug: 'original-x-copia',
      origin: 'PERSONALIZADO',
      baseGameId: null,
      availability: false,
      sizeValue: 5,
      sizeUnit: 'GB',
      deletedAt: null,
    });
    expect(copy.genres.map((item) => item.id)).toEqual([genre.id]);
    expect(copy.platforms.map((item) => item.id)).toEqual([platform.id]);

    expect(state.tenantGames.size).toBe(2);
    const sourceBridges = [...state.tenantGameGenres.values()].filter(
      (bridge) => bridge.tenantGameId === game.id,
    );
    const copyBridges = [...state.tenantGameGenres.values()].filter(
      (bridge) => bridge.tenantGameId === copy.id,
    );
    expect(sourceBridges).toHaveLength(1);
    expect(copyBridges).toHaveLength(1);
    expect(copyBridges[0]?.genreId).toBe(genre.id);
    expect(
      [...state.gamePlatforms.values()].filter((bridge) => bridge.tenantGameId === copy.id),
    ).toHaveLength(1);

    const log = [...state.auditLogs.values()].find((item) => item.action === 'CREATE');
    expect(log).toMatchObject({
      entity: 'TenantGame',
      entityId: copy.id,
      tenantId: T_JAVIER,
      actorId: 'u-admin',
    });
    expect(log?.metadata).toMatchObject({
      origin: 'PERSONALIZADO',
      slug: 'original-x-copia',
      duplicatedFrom: game.id,
    });
  });

  it('resuelve colisiones de slug con sufijo incremental', async () => {
    const game = seedGame({ slug: 'titulo-x' });
    seedGame({ slug: 'titulo-x-copia' });

    const { status, body } = await duplicate(game.id);

    expect(status).toBe(201);
    expect((body.data as GameDto).slug).toBe('titulo-x-copia-2');
  });

  it('devuelve 404 si el juego no existe', async () => {
    const { status, body } = await duplicate(randomUUID());

    expect(status).toBe(404);
    expect(body.error?.code).toBe('GAME_NOT_FOUND');
  });

  it('devuelve 404 si el id no es un uuid', async () => {
    const { status, body } = await duplicate('no-uuid');

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('el ADMIN no duplica juegos de otro tenant', async () => {
    const ajeno = seedGame({ tenantId: T_OTRO });

    const { status, body } = await duplicate(ajeno.id);

    expect(status).toBe(404);
    expect(body.error?.code).toBe('GAME_NOT_FOUND');
    expect(state.tenantGames.size).toBe(1);
  });

  it('no duplica juegos eliminados', async () => {
    const game = seedGame({ deletedAt: new Date() });

    const { status, body } = await duplicate(game.id);

    expect(status).toBe(404);
    expect(body.error?.code).toBe('GAME_NOT_FOUND');
    expect(state.tenantGames.size).toBe(1);
  });

  it('duplica un juego de biblioteca como personalizado', async () => {
    const base = addFakeBaseGame({ id: randomUUID(), title: 'Hit', slug: 'hit-base' });
    const game = seedGame({
      title: 'Hit',
      slug: 'hit-base',
      origin: 'BIBLIOTECA',
      baseGameId: base.id,
    });

    const { status, body } = await duplicate(game.id);

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      origin: 'PERSONALIZADO',
      baseGameId: null,
      slug: 'hit-base-copia',
      title: 'Hit (copia)',
    });
  });

  it('trunca títulos largos al añadir el sufijo', async () => {
    const game = seedGame({ title: 'A'.repeat(150), slug: 'largo-x' });

    const { status, body } = await duplicate(game.id);

    expect(status).toBe(201);
    const copy = body.data as GameDto;
    expect(copy.title).toHaveLength(150);
    expect(copy.title.endsWith(' (copia)')).toBe(true);
  });

  it('SUPER_ADMIN duplica juegos de cualquier tenant', async () => {
    const ajeno = seedGame({ tenantId: T_OTRO, title: 'Ajeno', slug: 'ajeno-x' });

    const { status, body } = await duplicate(ajeno.id, superToken);

    expect(status).toBe(201);
    expect(body.data).toMatchObject({ tenantId: T_OTRO, slug: 'ajeno-x-copia' });
  });
});
