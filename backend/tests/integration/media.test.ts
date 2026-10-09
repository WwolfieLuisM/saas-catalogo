import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyImage, listImages, uploadImage } from '../../src/config/cloudinary.js';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import type { FakeGameMedia, FakeTenantGame } from '../helpers/fakeDb.js';
import {
  addFakeCatalogMetadata,
  addFakeGameMedia,
  addFakeTenant,
  addFakeTenantGame,
  addFakeUser,
  resetFakeDb,
  state,
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

const uploadImageMock = vi.mocked(uploadImage);
const destroyImageMock = vi.mocked(destroyImage);
const listImagesMock = vi.mocked(listImages);

interface ApiBody<T> {
  success: boolean;
  data?: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  error?: { code: string; message: string; details?: unknown };
}

interface MediaDto {
  id: string;
  tenantId: string;
  gameId: string;
  kind: 'COVER' | 'SHOT';
  url: string | null;
  publicId: string | null;
  sortOrder: number;
  status: string;
  createdBy: string | null;
}

interface ManifestDto {
  gameId: string;
  slug: string;
  title: string;
  prefix: string;
  cover: MediaDto | null;
  screenshots: MediaDto[];
  counts: { total: number; ok: number; error: number; orphan: number; pending: number };
  synced: boolean;
}

interface MediaListItem extends MediaDto {
  game: { id: string; title: string; slug: string } | null;
}

interface ScanDto {
  cloudAssets: number;
  dbRows: number;
  markedOrphan: number;
  restored: number;
  assetsWithoutDb: string[];
  orphans: MediaDto[];
}

const GAMES = '/api/v1/admin/games';
const MEDIA = '/api/v1/admin/media';
const T_JAVIER = '11111111-1111-4111-8111-111111111111';
const T_OTRO = '22222222-2222-4222-8222-222222222222';

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;

const assets = new Set<string>();
let uploadFailures = 0;

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

interface TestFile {
  name: string;
  type: string;
  data: Uint8Array<ArrayBuffer>;
}

function pngFile(name = 'portada.png', size = 64): TestFile {
  return { name, type: 'image/png', data: new Uint8Array(size).fill(1) };
}

async function uploadFile(path: string, token?: string, file: TestFile | null = pngFile()) {
  const form = new FormData();
  if (file) {
    form.append('file', new Blob([file.data], { type: file.type }), file.name);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    body: form,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
  const body = (await response.json()) as ApiBody<MediaDto>;

  return { status: response.status, body };
}

function seedGame(overrides: Partial<FakeTenantGame> = {}): FakeTenantGame {
  return addFakeTenantGame({
    id: randomUUID(),
    tenantId: T_JAVIER,
    title: 'Juego Media',
    slug: `media-${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
}

function mediaRows() {
  return [...state.gameMedia.values()];
}

function auditRow(action: string) {
  return [...state.auditLogs.values()].find(
    (row) => row.action === action && row.entity === 'GameMedia',
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

  assets.clear();
  uploadFailures = 0;
  uploadImageMock.mockClear();
  destroyImageMock.mockClear();
  listImagesMock.mockClear();

  uploadImageMock.mockImplementation(async (input) => {
    if (uploadFailures > 0) {
      uploadFailures -= 1;
      throw new Error('cloudinary no disponible');
    }
    assets.add(input.publicId);
    return {
      url: `https://res.cloudinary.com/demo/image/upload/v1728/${input.publicId}.jpg`,
      publicId: input.publicId,
    };
  });
  destroyImageMock.mockImplementation(async (publicId) => {
    assets.delete(publicId);
  });
  listImagesMock.mockImplementation(async (prefix) =>
    [...assets].filter((id) => id.startsWith(prefix)),
  );
});

describe('POST /games/:id/cover', () => {
  it('devuelve 401 sin token', async () => {
    const game = seedGame();

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/cover`, undefined, null);

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('crea la portada con publicId por estructura y audita', async () => {
    const game = seedGame();

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      kind: 'COVER',
      status: 'OK',
      sortOrder: 0,
      tenantId: T_JAVIER,
      gameId: game.id,
      publicId: `tenants/${T_JAVIER}/games/${game.slug}/cover`,
    });
    expect(body.data?.url).toContain(`tenants/${T_JAVIER}/games/${game.slug}/cover`);
    expect(assets.has(`tenants/${T_JAVIER}/games/${game.slug}/cover`)).toBe(true);
    expect(mediaRows()).toHaveLength(1);
    expect(auditRow('MEDIA_UPLOADED')).toMatchObject({ entityId: body.data?.id });
  });

  it('reemplaza la portada existente sin duplicar filas', async () => {
    const game = seedGame();
    const first = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    const second = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(second.status).toBe(201);
    expect(second.body.data?.id).toBe(first.body.data?.id);
    expect(mediaRows()).toHaveLength(1);
    expect(mediaRows()[0]?.status).toBe('OK');
    expect(destroyImageMock).not.toHaveBeenCalled();
  });

  it('elimina el asset anterior si el publicId cambió', async () => {
    const game = seedGame();
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_JAVIER,
      gameId: game.id,
      kind: 'COVER',
      url: 'https://res.cloudinary.com/legacy.jpg',
      publicId: 'legacy/portada.png',
      status: 'OK',
      sortOrder: 0,
    });

    const { status } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(status).toBe(201);
    expect(destroyImageMock).toHaveBeenCalledWith('legacy/portada.png');
  });

  it('tras fallo definitivo crea fila ERROR y devuelve 502 con intentos', async () => {
    const game = seedGame();
    uploadFailures = 3;

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(status).toBe(502);
    expect(body.error?.code).toBe('MEDIA_UPLOAD_FAILED');
    expect(body.error?.details).toMatchObject({ attempts: 3 });
    expect(uploadImageMock).toHaveBeenCalledTimes(3);
    expect(mediaRows()).toHaveLength(1);
    expect(mediaRows()[0]).toMatchObject({ status: 'ERROR', url: null, publicId: null });
    expect(auditRow('MEDIA_UPLOADED')).toBeUndefined();
  });

  it('reintenta y triunfa al tercer intento', async () => {
    const game = seedGame();
    uploadFailures = 2;

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(status).toBe(201);
    expect(uploadImageMock).toHaveBeenCalledTimes(3);
    expect(body.data?.status).toBe('OK');
    expect(mediaRows()).toHaveLength(1);
  });

  it('reutiliza la fila ERROR en el segundo intento de subida', async () => {
    const game = seedGame();
    uploadFailures = 3;
    await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(status).toBe(201);
    expect(mediaRows()).toHaveLength(1);
    expect(mediaRows()[0]).toMatchObject({ status: 'OK', id: body.data?.id });
  });

  it('no degrada una portada OK si la subida de reemplazo falla', async () => {
    const game = seedGame();
    const first = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);
    uploadFailures = 3;

    const { status } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(status).toBe(502);
    expect(mediaRows()[0]).toMatchObject({ status: 'OK', id: first.body.data?.id });
  });

  it('rechaza formato no permitido', async () => {
    const game = seedGame();

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken, {
      name: 'animacion.gif',
      type: 'image/gif',
      data: new Uint8Array(16),
    });

    expect(status).toBe(422);
    expect(body.error?.code).toBe('MEDIA_INVALID_TYPE');
    expect(mediaRows()).toHaveLength(0);
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it('rechaza archivos sin cuerpo', async () => {
    const game = seedGame();

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken, null);

    expect(status).toBe(422);
    expect(body.error?.code).toBe('MEDIA_FILE_REQUIRED');
  });

  it('rechaza archivos mayores a 8 MB', async () => {
    const game = seedGame();

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken, {
      name: 'grande.png',
      type: 'image/png',
      data: new Uint8Array(8 * 1024 * 1024 + 1),
    });

    expect(status).toBe(422);
    expect(body.error?.code).toBe('MEDIA_FILE_TOO_LARGE');
    expect(mediaRows()).toHaveLength(0);
  });

  it('devuelve 404 si el juego pertenece a otro tenant', async () => {
    const other = seedGame({ tenantId: T_OTRO });

    const { status, body } = await uploadFile(`${GAMES}/${other.id}/cover`, adminToken);

    expect(status).toBe(404);
    expect(body.error?.code).toBe('GAME_NOT_FOUND');
  });

  it('devuelve 404 si el juego está eliminado', async () => {
    const game = seedGame({ deletedAt: new Date() });

    const { status } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(status).toBe(404);
  });
});

describe('POST /games/:id/screenshots', () => {
  it('asigna slots consecutivos con publicId shot-N', async () => {
    const game = seedGame();

    const first = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);
    const second = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);

    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      kind: 'SHOT',
      sortOrder: 0,
      publicId: `tenants/${T_JAVIER}/games/${game.slug}/shot-1`,
    });
    expect(second.body.data).toMatchObject({
      sortOrder: 1,
      publicId: `tenants/${T_JAVIER}/games/${game.slug}/shot-2`,
    });
    expect(mediaRows()).toHaveLength(2);
  });

  it('reutiliza el hueco liberado tras borrar una captura', async () => {
    const game = seedGame();
    const a = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);
    const b = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);
    const c = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);
    await api(
      `${GAMES}/${game.id}/screenshots/${b.body.data?.id}`,
      { method: 'DELETE' },
      adminToken,
    );

    const next = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);

    expect(next.status).toBe(201);
    expect(next.body.data?.sortOrder).toBe(1);
    expect(mediaRows()).toHaveLength(3);
    expect(
      mediaRows()
        .map((row) => row.sortOrder)
        .sort(),
    ).toEqual([0, 1, 2]);
    expect([a.body.data?.id, c.body.data?.id, next.body.data?.id]).toContain(next.body.data?.id);
  });

  it('rechaza una quinta captura sin tocar cloudinary', async () => {
    const game = seedGame();
    for (let index = 0; index < 4; index += 1) {
      addFakeGameMedia({
        id: randomUUID(),
        tenantId: T_JAVIER,
        gameId: game.id,
        kind: 'SHOT',
        sortOrder: index,
        publicId: `tenants/${T_JAVIER}/games/${game.slug}/shot-${index + 1}`,
        status: 'OK',
      });
    }

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);

    expect(status).toBe(422);
    expect(body.error?.code).toBe('MEDIA_LIMIT');
    expect(uploadImageMock).not.toHaveBeenCalled();
    expect(mediaRows()).toHaveLength(4);
  });

  it('reutiliza el slot ERROR tras un fallo de subida', async () => {
    const game = seedGame();
    uploadFailures = 3;
    const failed = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);

    expect(failed.status).toBe(502);
    expect(mediaRows()).toHaveLength(1);
    expect(mediaRows()[0]).toMatchObject({ status: 'ERROR', sortOrder: 0 });

    const { status, body } = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);

    expect(status).toBe(201);
    expect(body.data).toMatchObject({ sortOrder: 0, status: 'OK' });
    expect(mediaRows()).toHaveLength(1);
  });
});

describe('DELETE de media', () => {
  it('elimina la portada, el asset y audita', async () => {
    const game = seedGame();
    const cover = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);
    const publicId = `tenants/${T_JAVIER}/games/${game.slug}/cover`;

    const { status } = await api(`${GAMES}/${game.id}/cover`, { method: 'DELETE' }, adminToken);

    expect(status).toBe(200);
    expect(destroyImageMock).toHaveBeenCalledWith(publicId);
    expect(assets.has(publicId)).toBe(false);
    expect(mediaRows()).toHaveLength(0);
    expect(auditRow('MEDIA_DELETED')).toMatchObject({ entityId: cover.body.data?.id });
  });

  it('devuelve 404 si la portada no existe', async () => {
    const game = seedGame();

    const { status, body } = await api(
      `${GAMES}/${game.id}/cover`,
      { method: 'DELETE' },
      adminToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('MEDIA_NOT_FOUND');
  });

  it('elimina la fila aunque Cloudinary falle al borrar el asset', async () => {
    const game = seedGame();
    await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);
    const publicId = `tenants/${T_JAVIER}/games/${game.slug}/cover`;
    destroyImageMock.mockImplementationOnce(async () => {
      throw new Error('destroy caído');
    });

    const { status } = await api(`${GAMES}/${game.id}/cover`, { method: 'DELETE' }, adminToken);

    expect(status).toBe(200);
    expect(destroyImageMock).toHaveBeenCalledWith(publicId);
    expect(mediaRows()).toHaveLength(0);
    expect(assets.has(publicId)).toBe(true);
  });

  it('elimina una captura concreta', async () => {
    const game = seedGame();
    const shot = await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);

    const { status } = await api(
      `${GAMES}/${game.id}/screenshots/${shot.body.data?.id}`,
      { method: 'DELETE' },
      adminToken,
    );

    expect(status).toBe(200);
    expect(mediaRows()).toHaveLength(0);
    expect(destroyImageMock).toHaveBeenCalledTimes(1);
  });

  it('devuelve 404 si la captura pertenece a otro juego', async () => {
    const gameA = seedGame();
    const gameB = seedGame();
    const shot = await uploadFile(`${GAMES}/${gameB.id}/screenshots`, adminToken);

    const { status, body } = await api(
      `${GAMES}/${gameA.id}/screenshots/${shot.body.data?.id}`,
      { method: 'DELETE' },
      adminToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('MEDIA_NOT_FOUND');
    expect(mediaRows()).toHaveLength(1);
  });
});

describe('PATCH /games/:id/screenshots/reorder', () => {
  function seedShots(game: FakeTenantGame, count: number) {
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      rows.push(
        addFakeGameMedia({
          id: randomUUID(),
          tenantId: T_JAVIER,
          gameId: game.id,
          kind: 'SHOT',
          sortOrder: index,
          publicId: `tenants/${T_JAVIER}/games/${game.slug}/shot-${index + 1}`,
          status: 'OK',
        }),
      );
    }
    return rows;
  }

  it('reordena las capturas y audita', async () => {
    const game = seedGame();
    const [a, b, c] = seedShots(game, 3) as [FakeGameMedia, FakeGameMedia, FakeGameMedia];

    const { status, body } = await api<MediaDto[]>(
      `${GAMES}/${game.id}/screenshots/reorder`,
      { method: 'PATCH', body: JSON.stringify({ order: [c.id, a.id, b.id] }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.map((row) => row.id)).toEqual([c.id, a.id, b.id]);
    expect(body.data?.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
    expect(mediaRows().find((row) => row.id === c.id)?.sortOrder).toBe(0);
    expect(auditRow('MEDIA_REORDERED')).toBeDefined();
  });

  it('rechaza un orden que no coincide con las capturas', async () => {
    const game = seedGame();
    const shots = seedShots(game, 2);

    const { status, body } = await api(
      `${GAMES}/${game.id}/screenshots/reorder`,
      { method: 'PATCH', body: JSON.stringify({ order: [shots[0]!.id] }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('MEDIA_REORDER_INVALID');
  });

  it('rechaza ids duplicados en el orden', async () => {
    const game = seedGame();
    const shots = seedShots(game, 2);

    const { status, body } = await api(
      `${GAMES}/${game.id}/screenshots/reorder`,
      {
        method: 'PATCH',
        body: JSON.stringify({ order: [shots[0]!.id, shots[0]!.id] }),
      },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('MEDIA_REORDER_INVALID');
    expect(mediaRows()).toHaveLength(2);
  });

  it('rechaza un id de otro tenant', async () => {
    const game = seedGame();
    const other = seedGame({ tenantId: T_OTRO });
    const shots = seedShots(game, 2);
    const foreign = addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_OTRO,
      gameId: other.id,
      kind: 'SHOT',
      sortOrder: 0,
      status: 'OK',
    });

    const { status } = await api(
      `${GAMES}/${game.id}/screenshots/reorder`,
      {
        method: 'PATCH',
        body: JSON.stringify({ order: [...shots.map((row) => row.id), foreign.id] }),
      },
      adminToken,
    );

    expect(status).toBe(422);
  });
});

describe('GET /games/:id/media/manifest', () => {
  it('devuelve 401 sin token', async () => {
    const game = seedGame();

    const { status } = await api(`${GAMES}/${game.id}/media/manifest`);

    expect(status).toBe(401);
  });

  it('resume portada, capturas, prefijo y sincronización', async () => {
    const game = seedGame();
    await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);
    await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);
    await uploadFile(`${GAMES}/${game.id}/screenshots`, adminToken);

    const { status, body } = await api<ManifestDto>(
      `${GAMES}/${game.id}/media/manifest`,
      {},
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.prefix).toBe(`tenants/${T_JAVIER}/games/${game.slug}`);
    expect(body.data?.cover?.kind).toBe('COVER');
    expect(body.data?.screenshots.map((row) => row.sortOrder)).toEqual([0, 1]);
    expect(body.data?.counts).toEqual({ total: 3, ok: 3, error: 0, orphan: 0, pending: 0 });
    expect(body.data?.synced).toBe(true);
  });

  it('marca synced=false cuando hay una fila ERROR', async () => {
    const game = seedGame();
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_JAVIER,
      gameId: game.id,
      kind: 'SHOT',
      sortOrder: 0,
      status: 'ERROR',
    });

    const { status, body } = await api<ManifestDto>(
      `${GAMES}/${game.id}/media/manifest`,
      {},
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data?.cover).toBeNull();
    expect(body.data?.counts.error).toBe(1);
    expect(body.data?.synced).toBe(false);
  });

  it('devuelve 404 para un juego de otro tenant', async () => {
    const other = seedGame({ tenantId: T_OTRO });

    const { status } = await api(`${GAMES}/${other.id}/media/manifest`, {}, adminToken);

    expect(status).toBe(404);
  });
});

describe('GET /media', () => {
  it('lista solo la media del tenant de la sesión ADMIN', async () => {
    const game = seedGame();
    const other = seedGame({ tenantId: T_OTRO });
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_JAVIER,
      gameId: game.id,
      kind: 'COVER',
      status: 'OK',
    });
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_OTRO,
      gameId: other.id,
      kind: 'COVER',
      status: 'OK',
    });

    const { status, body } = await api<MediaDto[]>(MEDIA, {}, adminToken);

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(1);
    expect(body.data?.[0]?.tenantId).toBe(T_JAVIER);
  });

  it('exige tenantId para SUPER_ADMIN', async () => {
    const { status, body } = await api(MEDIA, {}, superToken);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('lista el tenant indicado para SUPER_ADMIN con resumen de juego', async () => {
    const other = seedGame({ tenantId: T_OTRO, title: 'Ajeno', slug: 'ajeno' });
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_OTRO,
      gameId: other.id,
      kind: 'COVER',
      status: 'OK',
    });

    const { status, body } = await api<MediaListItem[]>(
      `${MEDIA}?tenantId=${T_OTRO}&q=AJENO`,
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.meta?.total).toBe(1);
    expect(body.data?.[0]?.game).toMatchObject({ id: other.id, title: 'Ajeno' });
  });
});

describe('POST /media/scan', () => {
  it('devuelve 401 sin token', async () => {
    const { status } = await api(`${MEDIA}/scan`, { method: 'POST' });

    expect(status).toBe(401);
  });

  it('marca ORPHAN las filas sin asset y reporta assets sin fila', async () => {
    const game = seedGame();
    const missing = addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_JAVIER,
      gameId: game.id,
      kind: 'COVER',
      publicId: `tenants/${T_JAVIER}/games/${game.slug}/cover`,
      status: 'OK',
      sortOrder: 0,
    });
    assets.add(`tenants/${T_JAVIER}/games/${game.slug}/sueltos.png`);

    const { status, body } = await api<ScanDto>(`${MEDIA}/scan`, { method: 'POST' }, adminToken);

    expect(status).toBe(200);
    expect(body.data?.markedOrphan).toBe(1);
    expect(body.data?.assetsWithoutDb).toEqual([
      `tenants/${T_JAVIER}/games/${game.slug}/sueltos.png`,
    ]);
    expect(body.data?.orphans[0]?.id).toBe(missing.id);
    expect(mediaRows()[0]?.status).toBe('ORPHAN');
    expect(auditRow('MEDIA_SCAN')).toBeDefined();
  });

  it('restaura las filas ORPHAN cuyo asset volvió a existir', async () => {
    const game = seedGame();
    const publicId = `tenants/${T_JAVIER}/games/${game.slug}/cover`;
    addFakeGameMedia({
      id: randomUUID(),
      tenantId: T_JAVIER,
      gameId: game.id,
      kind: 'COVER',
      publicId,
      status: 'ORPHAN',
      sortOrder: 0,
    });
    assets.add(publicId);

    const { status, body } = await api<ScanDto>(`${MEDIA}/scan`, { method: 'POST' }, adminToken);

    expect(status).toBe(200);
    expect(body.data?.restored).toBe(1);
    expect(body.data?.markedOrphan).toBe(0);
    expect(mediaRows()[0]?.status).toBe('OK');
  });

  it('no escribe auditoría si no hay cambios', async () => {
    seedGame();

    const { status } = await api(`${MEDIA}/scan`, { method: 'POST' }, adminToken);

    expect(status).toBe(200);
    expect(auditRow('MEDIA_SCAN')).toBeUndefined();
  });

  it('devuelve 502 si cloudinary no responde', async () => {
    listImagesMock.mockImplementation(async () => {
      throw new Error('api caída');
    });

    const { status, body } = await api(`${MEDIA}/scan`, { method: 'POST' }, adminToken);

    expect(status).toBe(502);
    expect(body.error?.code).toBe('MEDIA_SCAN_FAILED');
    expect(listImagesMock).toHaveBeenCalledTimes(3);
  });

  it('permite a SUPER_ADMIN indicar tenantId explícito', async () => {
    const { status } = await api(
      `${MEDIA}/scan?tenantId=${T_OTRO}`,
      { method: 'POST' },
      superToken,
    );

    expect(status).toBe(200);
  });
});

describe('versionado del catálogo en media', () => {
  function catalogVersion(): number | undefined {
    return [...state.catalogMetadata.values()].find((row) => row.tenantId === T_JAVIER)?.version;
  }

  it('incrementa la versión al subir la portada de un juego visible', async () => {
    const game = seedGame();
    addFakeCatalogMetadata({ id: randomUUID(), tenantId: T_JAVIER, version: 1 });

    const { status } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(status).toBeLessThan(300);
    expect(catalogVersion()).toBe(2);
  });

  it('incrementa la versión si el juego está oculto (bump incondicional)', async () => {
    const game = seedGame({ availability: false });
    addFakeCatalogMetadata({ id: randomUUID(), tenantId: T_JAVIER, version: 1 });

    const { status } = await uploadFile(`${GAMES}/${game.id}/cover`, adminToken);

    expect(status).toBeLessThan(300);
    expect(catalogVersion()).toBe(2);
  });
});
