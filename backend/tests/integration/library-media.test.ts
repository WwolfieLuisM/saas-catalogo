import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyImage, uploadImage } from '../../src/config/cloudinary.js';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import type { FakeBaseGame } from '../helpers/fakeDb.js';
import {
  addFakeBaseGame,
  addFakeLibraryMedia,
  addFakeTenant,
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

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface LibraryMediaDto {
  id: string;
  baseGameId: string;
  kind: 'COVER' | 'SHOT';
  url: string | null;
  publicId: string | null;
  sortOrder: number;
  status: string;
  createdBy: string | null;
}

const BASE = '/api/v1/admin/base-games';
const T_JAVIER = '11111111-1111-4111-8111-111111111111';

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
  const body = (await response.json()) as ApiBody<LibraryMediaDto>;

  return { status: response.status, body };
}

function seedBaseGame(overrides: Partial<FakeBaseGame> = {}): FakeBaseGame {
  return addFakeBaseGame({
    id: randomUUID(),
    title: 'Hades',
    slug: `hades-${randomUUID().slice(0, 8)}`,
    description: 'Roguelike mitológico',
    sizeValue: 15,
    sizeUnit: 'GB',
    releaseYear: 2020,
    categoryId: null,
    ...overrides,
  });
}

function mediaPath(baseGameId: string, suffix = ''): string {
  return `${BASE}/${baseGameId}/media${suffix}`;
}

function libraryRows() {
  return [...state.libraryMedia.values()];
}

function auditRow(action: string) {
  return [...state.auditLogs.values()].find(
    (row) => row.action === action && row.entity === 'LibraryMedia',
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

  assets.clear();
  uploadFailures = 0;
  uploadImageMock.mockClear();
  destroyImageMock.mockClear();

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
});

describe('GET /base-games/:id/media', () => {
  it('devuelve 401 sin token', async () => {
    const game = seedBaseGame();

    const { status, body } = await api(mediaPath(game.id));

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve 404 si el juego no existe', async () => {
    const { status, body } = await api(mediaPath(randomUUID()), {}, superToken);

    expect(status).toBe(404);
    expect(body.error?.code).toBe('BASE_GAME_NOT_FOUND');
  });

  it('lista portada y capturas ordenadas', async () => {
    const game = seedBaseGame();
    addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'SHOT',
      sortOrder: 1,
      url: 'https://cdn/shot-1.jpg',
      publicId: 'library/x/shot-2',
    });
    addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'COVER',
      url: 'https://cdn/cover.jpg',
      publicId: 'library/x/cover',
    });
    addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'SHOT',
      sortOrder: 0,
      url: 'https://cdn/shot-0.jpg',
      publicId: 'library/x/shot-1',
    });

    const { status, body } = await api<LibraryMediaDto[]>(mediaPath(game.id), {}, adminToken);

    expect(status).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.data?.[0]?.kind).toBe('COVER');
    expect(body.data?.[1]?.sortOrder).toBe(0);
    expect(body.data?.[2]?.sortOrder).toBe(1);
  });
});

describe('POST /base-games/:id/media/cover', () => {
  it('devuelve 401 sin token', async () => {
    const game = seedBaseGame();

    const { status, body } = await uploadFile(mediaPath(game.id, '/cover'));

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('ADMIN no puede subir portada', async () => {
    const game = seedBaseGame();

    const { status, body } = await uploadFile(mediaPath(game.id, '/cover'), adminToken);

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('crea la portada con publicId de biblioteca y audita', async () => {
    const game = seedBaseGame();

    const { status, body } = await uploadFile(mediaPath(game.id, '/cover'), superToken);

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      kind: 'COVER',
      status: 'OK',
      sortOrder: 0,
      baseGameId: game.id,
      publicId: `library/games/${game.slug}/cover`,
    });
    expect(assets.has(`library/games/${game.slug}/cover`)).toBe(true);
    expect(auditRow('MEDIA_UPLOADED')).toMatchObject({
      entityId: body.data?.id,
      entity: 'LibraryMedia',
    });
  });

  it('reemplaza la portada anterior y borra el asset viejo', async () => {
    const game = seedBaseGame();
    const previous = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'COVER',
      url: 'https://cdn/old.jpg',
      publicId: 'library/games/old-slug/cover',
    });
    assets.add(previous.publicId!);

    const { status, body } = await uploadFile(mediaPath(game.id, '/cover'), superToken);

    expect(status).toBe(201);
    expect(body.data?.id).toBe(previous.id);
    expect(assets.has(`library/games/${game.slug}/cover`)).toBe(true);
    expect(destroyImageMock).toHaveBeenCalledWith('library/games/old-slug/cover');
  });

  it('devuelve 502 si Cloudinary falla y crea fila ERROR', async () => {
    const game = seedBaseGame();
    uploadFailures = 3;

    const { status, body } = await uploadFile(mediaPath(game.id, '/cover'), superToken);

    expect(status).toBe(502);
    expect(body.error?.code).toBe('MEDIA_UPLOAD_FAILED');
    expect(libraryRows().find((row) => row.kind === 'COVER')?.status).toBe('ERROR');
  });
});

describe('DELETE /base-games/:id/media/cover', () => {
  it('devuelve 404 si no hay portada', async () => {
    const game = seedBaseGame();

    const { status, body } = await api(mediaPath(game.id, '/cover'), { method: 'DELETE' }, superToken);

    expect(status).toBe(404);
    expect(body.error?.code).toBe('MEDIA_NOT_FOUND');
  });

  it('elimina la portada y el asset de Cloudinary', async () => {
    const game = seedBaseGame();
    const cover = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'COVER',
      url: 'https://cdn/cover.jpg',
      publicId: `library/games/${game.slug}/cover`,
      status: 'OK',
    });
    assets.add(cover.publicId!);

    const { status, body } = await api(mediaPath(game.id, '/cover'), { method: 'DELETE' }, superToken);

    expect(status).toBe(200);
    expect(body.data?.id).toBe(cover.id);
    expect(libraryRows()).toHaveLength(0);
    expect(assets.has(cover.publicId!)).toBe(false);
    expect(auditRow('MEDIA_DELETED')).toBeTruthy();
  });
});

describe('POST /base-games/:id/media/screenshots', () => {
  it('sube hasta 4 capturas y reutiliza slot ERROR', async () => {
    const game = seedBaseGame();
    const errorSlot = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'SHOT',
      sortOrder: 2,
      status: 'ERROR',
    });

    for (let index = 0; index < 4; index += 1) {
      const { status } = await uploadFile(mediaPath(game.id, '/screenshots'), superToken);
      expect(status).toBe(201);
    }

    const shots = libraryRows().filter((row) => row.kind === 'SHOT');
    expect(shots).toHaveLength(4);
    expect(shots.find((row) => row.id === errorSlot.id)?.status).toBe('OK');

    const fifth = await uploadFile(mediaPath(game.id, '/screenshots'), superToken);
    expect(fifth.status).toBe(422);
    expect(fifth.body.error?.code).toBe('MEDIA_LIMIT');
  });

  it('devuelve 403 a ADMIN', async () => {
    const game = seedBaseGame();

    const { status } = await uploadFile(mediaPath(game.id, '/screenshots'), adminToken);

    expect(status).toBe(403);
  });
});

describe('DELETE /base-games/:id/media/screenshots/:mediaId', () => {
  it('elimina la captura correcta', async () => {
    const game = seedBaseGame();
    const keep = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'SHOT',
      sortOrder: 0,
      publicId: 'library/x/keep',
      status: 'OK',
    });
    const shot = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'SHOT',
      sortOrder: 1,
      publicId: 'library/x/shot-2',
      status: 'OK',
    });
    assets.add(shot.publicId!);

    const { status } = await api(
      mediaPath(game.id, `/screenshots/${shot.id}`),
      { method: 'DELETE' },
      superToken,
    );

    expect(status).toBe(200);
    expect(libraryRows().map((row) => row.id)).toEqual([keep.id]);
    expect(assets.has(shot.publicId!)).toBe(false);
  });

  it('devuelve 404 si el id no pertenece al juego', async () => {
    const game = seedBaseGame();
    const other = seedBaseGame();
    const shot = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: other.id,
      kind: 'SHOT',
    });

    const { status, body } = await api(
      mediaPath(game.id, `/screenshots/${shot.id}`),
      { method: 'DELETE' },
      superToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('MEDIA_NOT_FOUND');
  });
});

describe('PATCH /base-games/:id/media/screenshots/reorder', () => {
  it('reordena capturas 0..n-1 y audita', async () => {
    const game = seedBaseGame();
    const a = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'SHOT',
      sortOrder: 0,
    });
    const b = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'SHOT',
      sortOrder: 1,
    });

    const { status, body } = await api<LibraryMediaDto[]>(
      mediaPath(game.id, '/screenshots/reorder'),
      { method: 'PATCH', body: JSON.stringify({ order: [b.id, a.id] }) },
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data?.map((row) => row.id)).toEqual([b.id, a.id]);
    expect(body.data?.map((row) => row.sortOrder)).toEqual([0, 1]);
    expect(auditRow('MEDIA_REORDERED')).toBeTruthy();
  });

  it('devuelve 422 si el orden no corresponde a las capturas', async () => {
    const game = seedBaseGame();
    const a = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: game.id,
      kind: 'SHOT',
    });

    const { status, body } = await api(
      mediaPath(game.id, '/screenshots/reorder'),
      { method: 'PATCH', body: JSON.stringify({ order: [a.id, randomUUID()] }) },
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('MEDIA_REORDER_INVALID');
  });
});
