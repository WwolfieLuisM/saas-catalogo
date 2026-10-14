import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakeGameMedia,
  addFakeTenant,
  addFakeTenantGame,
  addFakeUser,
  resetFakeDb,
  type FakeGameMedia,
} from '../helpers/fakeDb.js';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => fakeDb, closePrisma: async () => undefined };
});

vi.mock('../../src/config/cloudinary.js', () => ({
  uploadImage: vi.fn(),
  destroyImage: vi.fn(),
  listImages: vi.fn(),
}));

interface ApiBody<T> {
  success: boolean;
  data?: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  error?: { code: string; message: string; details?: unknown };
}

interface AuditItem {
  id: string;
  tenantId: string;
  gameId: string;
  gameTitle: string | null;
  kind: string;
  status: string;
  url: string | null;
  publicId: string | null;
  hosting: string;
  provider: string | null;
  attention: string[];
  needsAttention: boolean;
}

interface AuditSummary {
  total: number;
  cloudinary: number;
  external: number;
  missingUrl: number;
  missingPublicId: number;
  needsAttention: number;
}

interface AuditData {
  items: AuditItem[];
  summary: AuditSummary;
}

interface CheckResult {
  id: string;
  result: string;
  httpStatus: number | null;
  detail: string | null;
}

interface CheckData {
  results: CheckResult[];
  summary: Record<string, number>;
  checkedAt: string;
}

const MEDIA = '/api/v1/admin/media';
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

function seedGame(tenantId: string, title: string) {
  return addFakeTenantGame({
    id: randomUUID(),
    tenantId,
    title,
    slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${randomUUID().slice(0, 6)}`,
  });
}

function seedCover(
  tenantId: string,
  gameId: string,
  overrides: Partial<Pick<FakeGameMedia, 'url' | 'publicId' | 'status'>> = {},
) {
  return addFakeGameMedia({
    id: randomUUID(),
    tenantId,
    gameId,
    kind: 'COVER',
    url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/example.jpg',
    publicId: null,
    status: 'OK',
    ...overrides,
  });
}

describe('GET /admin/media/audit', () => {
  it('rechaza peticiones sin autenticación', async () => {
    const { status } = await api(`${MEDIA}/audit`);
    expect(status).toBe(401);
  });

  it('devuelve items, summary y meta con los contadores del tenant', async () => {
    const game = seedGame(T_JAVIER, 'Juego A');
    seedCover(T_JAVIER, game.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
      publicId: 'tenants/javier/games/juego-a/cover',
    });
    seedCover(T_JAVIER, game.id, {
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/other.jpg',
      publicId: null,
    });
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_JAVIER,
      gameId: game.id,
      kind: 'SHOT',
      url: null,
      publicId: null,
      status: 'ORPHAN',
      sortOrder: 1,
    });

    const { status, body } = await api<AuditData>(`${MEDIA}/audit`, {}, adminToken);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const data = body.data as AuditData;
    expect(data.items).toHaveLength(3);
    expect(data.summary).toEqual({
      total: 3,
      cloudinary: 1,
      external: 1,
      missingUrl: 1,
      missingPublicId: 2,
      needsAttention: 2,
    });
    expect(body.meta).toMatchObject({ page: 1, pageSize: 20, total: 3, totalPages: 1 });
  });

  it('marca hotlinks externos con la señal hotlink-externo y sin publicId', async () => {
    const game = seedGame(T_JAVIER, 'Juego B');
    const cover = seedCover(T_JAVIER, game.id, {
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coal.jpg',
      publicId: null,
    });

    const { body } = await api<AuditData>(`${MEDIA}/audit`, {}, adminToken);
    const item = (body.data as AuditData).items.find((entry) => entry.id === cover.id);

    expect(item).toBeDefined();
    expect(item?.hosting).toBe('external');
    expect(item?.provider).toBe('igdb');
    expect(item?.attention).toContain('hotlink-externo');
    expect(item?.attention).toContain('sin-public-id');
    expect(item?.needsAttention).toBe(true);
  });

  it('no marca como necesitando atención un recurso de Cloudinary completo', async () => {
    const game = seedGame(T_JAVIER, 'Juego C');
    const cover = seedCover(T_JAVIER, game.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
      publicId: 'tenants/javier/games/juego-c/cover',
    });

    const { body } = await api<AuditData>(`${MEDIA}/audit`, {}, adminToken);
    const item = (body.data as AuditData).items.find((entry) => entry.id === cover.id);

    expect(item?.hosting).toBe('cloudinary');
    expect(item?.attention).toEqual([]);
    expect(item?.needsAttention).toBe(false);
  });

  it('detecta publicId repetido como posible duplicado', async () => {
    const game = seedGame(T_JAVIER, 'Juego D');
    const publicId = 'tenants/javier/games/juego-d/cover';
    const first = seedCover(T_JAVIER, game.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
      publicId,
    });
    const second = seedCover(T_JAVIER, game.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
      publicId,
    });

    const { body } = await api<AuditData>(`${MEDIA}/audit`, {}, adminToken);
    const items = (body.data as AuditData).items;
    const firstItem = items.find((entry) => entry.id === first.id);
    const secondItem = items.find((entry) => entry.id === second.id);

    expect(firstItem?.attention).toContain('public-id-repetido');
    expect(secondItem?.attention).toContain('public-id-repetido');
  });

  it('detecta dos portadas del mismo juego con el mismo patrón de URL', async () => {
    const game = seedGame(T_JAVIER, 'Juego E');
    const first = seedCover(T_JAVIER, game.id, {
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/aaa.jpg',
      publicId: null,
    });
    const second = seedCover(T_JAVIER, game.id, {
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/bbb.jpg',
      publicId: null,
    });

    const { body } = await api<AuditData>(`${MEDIA}/audit`, {}, adminToken);
    const items = (body.data as AuditData).items;
    const firstItem = items.find((entry) => entry.id === first.id);
    const secondItem = items.find((entry) => entry.id === second.id);

    expect(firstItem?.attention).toContain('patron-url-repetido');
    expect(secondItem?.attention).toContain('patron-url-repetido');
  });

  it('no marca duplicados cuando los patrones de URL del mismo juego difieren', async () => {
    const game = seedGame(T_JAVIER, 'Juego F');
    seedCover(T_JAVIER, game.id, {
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/aaa.jpg',
      publicId: null,
    });
    seedCover(T_JAVIER, game.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/bbb.jpg',
      publicId: null,
    });

    const { body } = await api<AuditData>(`${MEDIA}/audit`, {}, adminToken);
    const items = (body.data as AuditData).items;

    for (const item of items) {
      expect(item.attention).not.toContain('patron-url-repetido');
    }
  });

  it('ADMIN no puede consultar otro tenant', async () => {
    const { status, body } = await api<AuditData>(
      `${MEDIA}/audit?tenantId=${T_OTRO}`,
      {},
      adminToken,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('SUPER_ADMIN puede filtrar por tenant', async () => {
    const gameJavier = seedGame(T_JAVIER, 'Javier Game');
    const gameOtro = seedGame(T_OTRO, 'Otro Game');
    seedCover(T_JAVIER, gameJavier.id, { publicId: 'tenants/javier/games/javier-game/cover' });
    seedCover(T_OTRO, gameOtro.id, { publicId: 'tenants/otro/games/otro-game/cover' });

    const { body } = await api<AuditData>(`${MEDIA}/audit?tenantId=${T_OTRO}`, {}, superToken);
    const data = body.data as AuditData;

    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.tenantId).toBe(T_OTRO);
    expect(data.summary.total).toBe(1);
  });

  it('SUPER_ADMIN sin tenantId ve todos los tenants', async () => {
    const gameJavier = seedGame(T_JAVIER, 'Javier Game');
    const gameOtro = seedGame(T_OTRO, 'Otro Game');
    seedCover(T_JAVIER, gameJavier.id, { publicId: 'a' });
    seedCover(T_OTRO, gameOtro.id, { publicId: 'b' });

    const { body } = await api<AuditData>(`${MEDIA}/audit`, {}, superToken);
    const data = body.data as AuditData;

    expect(data.summary.total).toBe(2);
    expect(new Set(data.items.map((item) => item.tenantId))).toEqual(
      new Set([T_JAVIER, T_OTRO]),
    );
  });

  it('SUPER_ADMIN con tenantId inexistente recibe 422', async () => {
    const { status, body } = await api<AuditData>(
      `${MEDIA}/audit?tenantId=${randomUUID()}`,
      {},
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('filtra por hosting externo sin perder el summary global', async () => {
    const game = seedGame(T_JAVIER, 'Juego G');
    seedCover(T_JAVIER, game.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
      publicId: 'tenants/javier/games/juego-g/cover',
    });
    seedCover(T_JAVIER, game.id, {
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg',
      publicId: null,
    });

    const { body } = await api<AuditData>(`${MEDIA}/audit?hosting=external`, {}, adminToken);
    const data = body.data as AuditData;

    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.hosting).toBe('external');
    expect(data.summary.total).toBe(2);
    expect(body.meta).toMatchObject({ total: 1, totalPages: 1 });
  });

  it('filtra por status y por provider', async () => {
    const game = seedGame(T_JAVIER, 'Juego H');
    seedCover(T_JAVIER, game.id, {
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg',
      publicId: null,
      status: 'ORPHAN',
    });
    seedCover(T_JAVIER, game.id, {
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/b.jpg',
      publicId: null,
      status: 'OK',
    });

    const byStatus = await api<AuditData>(`${MEDIA}/audit?status=ORPHAN`, {}, adminToken);
    expect((byStatus.body.data as AuditData).items).toHaveLength(1);

    const byProvider = await api<AuditData>(`${MEDIA}/audit?provider=igdb`, {}, adminToken);
    expect((byProvider.body.data as AuditData).items).toHaveLength(2);

    const wrongProvider = await api<AuditData>(`${MEDIA}/audit?provider=steam`, {}, adminToken);
    expect((wrongProvider.body.data as AuditData).items).toHaveLength(0);
  });

  it('pagina los resultados', async () => {
    const game = seedGame(T_JAVIER, 'Juego I');
    for (let index = 0; index < 3; index += 1) {
      seedCover(T_JAVIER, game.id, {
        url: `https://images.igdb.com/igdb/image/upload/t_cover_big/${index}.jpg`,
        publicId: null,
      });
    }

    const { body } = await api<AuditData>(`${MEDIA}/audit?page=2&limit=2`, {}, adminToken);
    const data = body.data as AuditData;

    expect(data.items).toHaveLength(1);
    expect(body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
  });
});

describe('POST /admin/media/audit/check', () => {
  it('rechaza peticiones sin autenticación', async () => {
    const { status } = await api(`${MEDIA}/audit/check`, {
      method: 'POST',
      body: JSON.stringify({ ids: [randomUUID()] }),
    });
    expect(status).toBe(401);
  });

  it('rechaza una lista vacía', async () => {
    const { status } = await api(
      `${MEDIA}/audit/check`,
      { method: 'POST', body: JSON.stringify({ ids: [] }) },
      adminToken,
    );
    expect(status).toBe(400);
  });

  it('rechaza más de 50 identificadores', async () => {
    const ids = Array.from({ length: 51 }, () => randomUUID());
    const { status } = await api(
      `${MEDIA}/audit/check`,
      { method: 'POST', body: JSON.stringify({ ids }) },
      adminToken,
    );
    expect(status).toBe(400);
  });

  it('marca como inconcluso un recurso sin URL sin hacer peticiones externas', async () => {
    const game = seedGame(T_JAVIER, 'Juego J');
    const cover = seedCover(T_JAVIER, game.id, { url: null, publicId: null });

    const { status, body } = await api<CheckData>(
      `${MEDIA}/audit/check`,
      { method: 'POST', body: JSON.stringify({ ids: [cover.id] }) },
      adminToken,
    );

    expect(status).toBe(200);
    const data = body.data as CheckData;
    expect(data.results).toEqual([
      { id: cover.id, result: 'inconclusive', httpStatus: null, detail: 'SIN_URL' },
    ]);
    expect(data.summary.inconclusive).toBe(1);
    expect(data.checkedAt).toBeTruthy();
  });

  it('bloquea destinos locales o privados sin salir de la red interna', async () => {
    const game = seedGame(T_JAVIER, 'Juego K');
    const loopback = seedCover(T_JAVIER, game.id, {
      url: 'http://127.0.0.1:9999/cover.jpg',
      publicId: null,
    });
    const privateNet = seedCover(T_JAVIER, game.id, {
      url: 'http://192.168.1.10/cover.jpg',
      publicId: null,
    });
    const localhost = seedCover(T_JAVIER, game.id, {
      url: 'http://localhost/cover.jpg',
      publicId: null,
    });

    const { body } = await api<CheckData>(
      `${MEDIA}/audit/check`,
      {
        method: 'POST',
        body: JSON.stringify({ ids: [loopback.id, privateNet.id, localhost.id] }),
      },
      adminToken,
    );

    const data = body.data as CheckData;
    expect(data.results).toHaveLength(3);
    for (const result of data.results) {
      expect(result.result).toBe('blocked');
      expect(result.detail).toBe('DESTINO_BLOQUEADO');
    }
    expect(data.summary.blocked).toBe(3);
  });

  it('bloquea protocolos no permitidos', async () => {
    const game = seedGame(T_JAVIER, 'Juego L');
    const cover = seedCover(T_JAVIER, game.id, {
      url: 'ftp://example.com/cover.jpg',
      publicId: null,
    });

    const { body } = await api<CheckData>(
      `${MEDIA}/audit/check`,
      { method: 'POST', body: JSON.stringify({ ids: [cover.id] }) },
      adminToken,
    );

    expect((body.data as CheckData).results[0]).toMatchObject({
      result: 'blocked',
      detail: 'PROTOCOLO_NO_PERMITIDO',
    });
  });

  it('devuelve not_found para recursos inexistentes o de otro tenant', async () => {
    const gameOtro = seedGame(T_OTRO, 'Otro Game');
    const foreign = seedCover(T_OTRO, gameOtro.id, {
      url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg',
      publicId: null,
    });

    const { body } = await api<CheckData>(
      `${MEDIA}/audit/check`,
      { method: 'POST', body: JSON.stringify({ ids: [foreign.id, randomUUID()] }) },
      adminToken,
    );

    const data = body.data as CheckData;
    expect(data.results).toHaveLength(2);
    for (const result of data.results) {
      expect(result.result).toBe('not_found');
      expect(result.detail).toBe('RECURSO_NO_ENCONTRADO');
    }
  });

  it('SUPER_ADMIN puede comprobar recursos de cualquier tenant', async () => {
    const gameOtro = seedGame(T_OTRO, 'Otro Game');
    const foreign = seedCover(T_OTRO, gameOtro.id, { url: null, publicId: null });

    const { body } = await api<CheckData>(
      `${MEDIA}/audit/check`,
      { method: 'POST', body: JSON.stringify({ ids: [foreign.id] }) },
      superToken,
    );

    expect((body.data as CheckData).results[0]?.result).toBe('inconclusive');
  });

  it('no escribe en la base de datos', async () => {
    const game = seedGame(T_JAVIER, 'Juego M');
    const cover = seedCover(T_JAVIER, game.id, { url: null, publicId: null, status: 'OK' });

    await api(
      `${MEDIA}/audit/check`,
      { method: 'POST', body: JSON.stringify({ ids: [cover.id] }) },
      adminToken,
    );

    const { state } = await import('../helpers/fakeDb.js');
    const row = state.gameMedia.get(cover.id);
    expect(row?.status).toBe('OK');
    expect(state.auditLogs.size).toBe(0);
  });
});
