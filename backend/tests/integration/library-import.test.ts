import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakeBaseGame,
  addFakeBaseGameGenre,
  addFakeBaseGamePlatform,
  addFakeCategory,
  addFakeGenre,
  addFakeLibraryMedia,
  addFakePlatform,
  addFakeTenant,
  addFakeTenantGame,
  addFakeUser,
  fakeDb,
  resetFakeDb,
  state,
} from '../helpers/fakeDb.js';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb: db } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => db, closePrisma: async () => undefined };
});

const descargas: string[] = [];
const subidas: string[] = [];
const respuestaDescarga = new Map<string, { result: string; detail: string | null }>();
let fallarSubida = false;

vi.mock('../../src/utils/safeUrl.js', () => ({
  safeGetImage: vi.fn(async (url: string) => {
    descargas.push(url);
    const configurada = respuestaDescarga.get(url) ?? { result: 'ok', detail: null };
    return configurada.result === 'ok'
      ? {
        result: 'ok',
        detail: null,
        buffer: Buffer.from('bytes-de-portada'),
        contentType: 'image/jpeg',
        httpStatus: 200,
      }
      : { result: configurada.result, detail: configurada.detail, buffer: null, contentType: null, httpStatus: null };
  }),
}));

vi.mock('../../src/config/cloudinary.js', () => ({
  uploadImage: vi.fn(async ({ publicId }: { buffer: Buffer; publicId: string }) => {
    subidas.push(publicId);
    if (fallarSubida) throw new Error('Cloudinary no disponible');
    return { url: `https://res.cloudinary.com/demo/image/upload/${publicId}.jpg`, publicId };
  }),
  destroyImage: vi.fn(async () => undefined),
  listImages: vi.fn(async () => []),
}));

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface RecordError {
  code: string;
  field: string;
  message: string;
}

interface PreviewRecord {
  index: number;
  slug: string | null;
  action: 'create' | 'update' | 'skip' | 'error';
  status: 'ACTIVE' | 'INCOMPLETE' | null;
  errors: RecordError[];
  changes: string[];
}

interface ImportData {
  fingerprint: string;
  summary: { create: number; update: number; skip: number; error: number };
  records: Array<{
    index: number;
    slug: string | null;
    action: 'create' | 'update' | 'skip' | 'error';
    status: 'ACTIVE' | 'INCOMPLETE' | null;
    errors: RecordError[];
    auditId: string | null;
  }>;
  warnings: string[];
}

interface ValidateData {
  fingerprint: string;
  stateFingerprint: string;
  schema: string;
  summary: { total: number; create: number; update: number; skip: number; error: number };
  records: PreviewRecord[];
  taxonomy: { missingGenres: string[]; missingCategories: string[]; missingPlatforms: string[] };
}

const VALIDATE = '/api/v1/admin/library-import/validate';
const IMPORT = '/api/v1/admin/library-import/import';
const T_JAVIER = '11111111-1111-4111-8111-111111111111';

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

function validate(envelope: unknown, token = superToken) {
  return api<ValidateData>(
    VALIDATE,
    { method: 'POST', body: JSON.stringify(envelope) },
    token,
  );
}

function envelope(games: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    schema: 'library-import@2',
    generatedAt: '2026-10-15T12:00:00.000Z',
    source: 'fixture-test',
    games,
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Hades',
    slug: 'hades',
    description: 'Roguelike de acción mitológico',
    categorySlug: 'accion',
    genreSlugs: ['indie'],
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2w6y.jpg',
    platformVariants: [{ platformSlug: 'pc', sizeValue: 15, sizeUnit: 'GB' }],
    ...overrides,
  };
}

function previewAt(data: ValidateData, index: number): PreviewRecord {
  const found = data.records[index];
  if (!found) throw new Error(`Falta el registro ${index} en el preview`);
  return found;
}

async function importar(
  payload: unknown,
  options: { token?: string; fingerprint?: string; stateFingerprint?: string } = {},
) {
  const token = options.token ?? superToken;
  const preview = await validate(payload, token);
  const fingerprint = options.fingerprint ?? preview.body.data!.fingerprint;
  const stateFingerprint = options.stateFingerprint ?? preview.body.data!.stateFingerprint;
  return api<ImportData>(
    IMPORT,
    {
      method: 'POST',
      body: JSON.stringify({ envelope: payload, fingerprint, stateFingerprint }),
    },
    token,
  );
}

function errorAt(data: ValidateData, recordIndex: number, errorIndex: number): RecordError {
  const found = previewAt(data, recordIndex).errors[errorIndex];
  if (!found) throw new Error(`Falta el error ${errorIndex} del registro ${recordIndex}`);
  return found;
}

function seedGlobalDictionary() {
  addFakeCategory({ id: randomUUID(), tenantId: null, name: 'Acción', slug: 'accion' });
  addFakeGenre({ id: randomUUID(), tenantId: null, name: 'Indie', slug: 'indie' });
  addFakeGenre({ id: randomUUID(), tenantId: null, name: 'Rol', slug: 'rol' });
  addFakePlatform({ id: randomUUID(), tenantId: null, name: 'PC', slug: 'pc' });
  addFakePlatform({ id: randomUUID(), tenantId: null, name: 'PlayStation 5', slug: 'ps5' });
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
  descargas.length = 0;
  subidas.length = 0;
  fallarSubida = false;
  respuestaDescarga.clear();
  addFakeTenant({ id: T_JAVIER, name: 'Javier', slug: 'javier' });
  addFakeUser({ id: 'u-super', username: 'root', role: 'SUPER_ADMIN', tenantId: null });
  addFakeUser({ id: 'u-admin', username: 'javier-admin', role: 'ADMIN', tenantId: T_JAVIER });
});

describe('POST /api/v1/admin/library-import/validate', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api(VALIDATE, {
      method: 'POST',
      body: JSON.stringify(envelope([])),
    });

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve 403 para el rol ADMIN', async () => {
    const { status, body } = await validate(envelope([record()]), adminToken);

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('rechaza 400 si el schema no es library-import@2', async () => {
    const { status, body } = await validate(envelope([record()], { schema: 'library-import@1' }));

    expect(status).toBe(400);
    expect(body.error?.code).toBe('LIBRARY_IMPORT_SCHEMA_UNSUPPORTED');
    expect(body.error?.message).toContain('library-import@2');
  });

  it('rechaza 400 con campos extra en el envelope', async () => {
    const { status, body } = await validate(envelope([record()], { extra: 'no' }));

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('acepta el schema con espacios sobrantes y da el mensaje de regeneración si no es texto', async () => {
    seedGlobalDictionary();
    const conEspacios = await validate(envelope([], { schema: ' library-import@2 ' }));
    const numero = await validate(envelope([], { schema: 2 }));
    const nulo = await validate(envelope([], { schema: null }));

    expect(conEspacios.status).toBe(200);
    expect(numero.status).toBe(400);
    expect(numero.body.error?.code).toBe('LIBRARY_IMPORT_SCHEMA_UNSUPPORTED');
    expect(numero.body.error?.message).toContain('library-import@2');
    expect(nulo.status).toBe(400);
    expect(nulo.body.error?.code).toBe('LIBRARY_IMPORT_SCHEMA_UNSUPPORTED');
  });
    it('devuelve preview con create/update/skip, estados derivados y fingerprint, sin escribir nada', async () => {
    seedGlobalDictionary();
    const category = [...state.categories.values()].find((row) => row.slug === 'accion')!;
    const genre = [...state.genres.values()].find((row) => row.slug === 'indie')!;
    const platform = [...state.platforms.values()].find((row) => row.slug === 'pc')!;
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Hades',
      slug: 'hades',
      description: 'Roguelike de acción mitológico',
      categoryId: category.id,
      sizeValue: 15,
      sizeUnit: 'GB',
      status: 'ACTIVE',
    });
    addFakeBaseGameGenre(existente.id, genre.id);
    addFakeBaseGamePlatform(existente.id, platform.id, { sizeValue: 15, sizeUnit: 'GB' });
    addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: existente.id,
      kind: 'COVER',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/cover.jpg',
      publicId: 'library/games/hades/cover',
      status: 'OK',
    });
    addFakeBaseGame({
      id: randomUUID(),
      title: 'Regression',
      slug: 'regresion',
      description: null,
      sizeValue: 3,
      sizeUnit: 'GB',
      status: 'INCOMPLETE',
    });
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      title: 'No me toques',
      slug: 'intocable',
      sizeValue: 1,
      sizeUnit: 'GB',
    });

    const { status, body } = await validate(
      envelope([
        record({ slug: 'nuevo-juego', title: 'Juego Nuevo' }),
        record(),
        record({ slug: 'regresion', title: 'Regresión Corregida' }),
        record({
          slug: 'sin-completar',
          title: 'Incompleto',
          description: null,
          coverUrl: undefined,
          categorySlug: undefined,
          genreSlugs: undefined,
          platformVariants: [{ platformSlug: 'pc' }],
        }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(data.schema).toBe('library-import@2');
    expect(data.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(data.summary).toEqual({ total: 4, create: 2, update: 1, skip: 1, error: 0 });

    expect(previewAt(data, 0)).toMatchObject({
      index: 0,
      slug: 'nuevo-juego',
      action: 'create',
      status: 'ACTIVE',
      errors: [],
      changes: ['+new'],
    });
    expect(previewAt(data, 1)).toMatchObject({
      index: 1,
      slug: 'hades',
      action: 'skip',
      status: 'ACTIVE',
      changes: [],
    });
    expect(previewAt(data, 2)).toMatchObject({
      index: 2,
      slug: 'regresion',
      action: 'update',
      status: 'ACTIVE',
    });
    expect(previewAt(data, 2).changes).toContain('title');
    expect(previewAt(data, 3)).toMatchObject({
      index: 3,
      slug: 'sin-completar',
      action: 'create',
      status: 'INCOMPLETE',
    });

    expect(state.baseGames.size).toBe(2);
    expect(state.auditLogs.size).toBe(0);
    const intocable = [...state.tenantGames.values()].find((row) => row.slug === 'intocable');
    expect(intocable?.title).toBe('No me toques');
  });

  it('marca los campos extra de un registro como error por registro sin frenar el resto', async () => {
    seedGlobalDictionary();

    const { status, body } = await validate(
      envelope([
        record({ slug: 'con-extra', status: 'ACTIVE', origin: 'steam' }),
        record({ slug: 'sano', title: 'Sano' }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(data.summary).toMatchObject({ total: 2, create: 1, error: 1 });
    expect(previewAt(data, 0)).toMatchObject({ slug: 'con-extra', action: 'error', status: null });
    expect(previewAt(data, 0).errors.some((error) => error.code === 'SCHEMA_INVALID')).toBe(true);
    expect(previewAt(data, 0).errors.map((error) => error.field).join(',')).toContain('status');
    expect(previewAt(data, 1)).toMatchObject({ slug: 'sano', action: 'create' });
  });

  it('marca taxonomía fuera del diccionario global y nunca auto-crea', async () => {
    seedGlobalDictionary();
    addFakeGenre({ id: randomUUID(), tenantId: T_JAVIER, name: 'De Tenant', slug: 'de-tenant' });
    const genreCount = state.genres.size;
    const categoryCount = state.categories.size;
    const platformCount = state.platforms.size;

    const { status, body } = await validate(
      envelope([
        record({ slug: 'mal-genero', genreSlugs: ['no-existe'] }),
        record({ slug: 'mal-categoria', categorySlug: 'sin-cat' }),
        record({ slug: 'mal-plataforma', platformVariants: [{ platformSlug: 'atari' }] }),
        record({ slug: 'genero-tenant', genreSlugs: ['de-tenant'] }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(data.summary).toMatchObject({ total: 4, error: 4, create: 0 });
    expect(data.taxonomy.missingGenres.sort()).toEqual(['de-tenant', 'no-existe']);
    expect(data.taxonomy.missingCategories).toEqual(['sin-cat']);
    expect(data.taxonomy.missingPlatforms).toEqual(['atari']);
    expect(errorAt(data, 0, 0)).toMatchObject({
      code: 'TAXONOMY_GENRE_UNKNOWN',
      field: 'genreSlugs',
    });
    expect(state.genres.size).toBe(genreCount);
    expect(state.categories.size).toBe(categoryCount);
    expect(state.platforms.size).toBe(platformCount);
  });

  it('rechaza tamaños sin pareja y variantes de plataforma duplicadas por registro', async () => {
    seedGlobalDictionary();

    const { status, body } = await validate(
      envelope([
        record({ slug: 'sin-unidad', platformVariants: [{ platformSlug: 'pc', sizeValue: 15 }] }),
        record({
          slug: 'duplicada',
          platformVariants: [
            { platformSlug: 'pc', sizeValue: 1, sizeUnit: 'GB' },
            { platformSlug: 'pc', sizeValue: 2, sizeUnit: 'GB' },
          ],
        }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(errorAt(data, 0, 0)).toMatchObject({
      code: 'SIZE_PAIR_INVALID',
      field: 'platformVariants[0]',
    });
    expect(errorAt(data, 1, 0)).toMatchObject({
      code: 'PLATFORM_VARIANT_DUPLICATE',
      field: 'platformVariants[1].platformSlug',
    });
    expect(data.summary.error).toBe(2);
  });

  it('la doble ejecución devuelve el mismo preview y el mismo fingerprint', async () => {
    seedGlobalDictionary();
    const payload = envelope([
      record({ slug: 'uno', title: 'Uno' }),
      record({ slug: 'dos', title: 'Dos', coverUrl: undefined, sizeValue: undefined }),
    ]);

    const primera = await validate(payload);
    const segunda = await validate(payload);

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.body.data!.fingerprint).toBe(primera.body.data!.fingerprint);
    expect(segunda.body.data!.records).toEqual(primera.body.data!.records);
    expect(state.auditLogs.size).toBe(0);
  });

  it('detecta actualización de un juego borrado lógicamente (revive)', async () => {
    seedGlobalDictionary();
    addFakeBaseGame({
      id: randomUUID(),
      title: 'Zombie',
      slug: 'zombie',
      description: 'Roguelike de acción mitológico',
      sizeValue: 15,
      sizeUnit: 'GB',
      status: 'ACTIVE',
      deletedAt: new Date(),
    });

    const { status, body } = await validate(envelope([record({ slug: 'zombie' })]));

    expect(status).toBe(200);
    const data = body.data!;
    expect(previewAt(data, 0)).toMatchObject({ action: 'update', status: 'ACTIVE' });
    expect(previewAt(data, 0).changes).toContain('deletedAt');
    expect(state.baseGames.size).toBe(1);
    expect([...state.baseGames.values()][0]?.deletedAt).toBeInstanceOf(Date);
  });

  it('refleja cambios de campos y de estado derivado en el preview de actualización', async () => {
    seedGlobalDictionary();
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Viejo Título',
      slug: 'actualiza-estado',
      description: null,
      sizeValue: 5,
      sizeUnit: 'GB',
      status: 'INCOMPLETE',
    });

    const { status, body } = await validate(
      envelope([
        record({
          slug: 'actualiza-estado',
          title: 'Nuevo Título',
          description: 'Ahora con descripción',
          sizeValue: undefined,
          platformVariants: [{ platformSlug: 'pc', sizeValue: 5, sizeUnit: 'GB' }],
        }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(previewAt(data, 0)).toMatchObject({ action: 'update', status: 'ACTIVE' });
    expect(previewAt(data, 0).changes).toEqual(
      expect.arrayContaining(['title', 'description', 'status']),
    );
    expect(state.baseGames.get(existente.id)?.title).toBe('Viejo Título');
  });

  it('marca error los slugs duplicados dentro del mismo archivo sin arrastrar al resto', async () => {
    seedGlobalDictionary();

    const { status, body } = await validate(
      envelope([
        record({ slug: 'repetido', title: 'Primero' }),
        record({ slug: 'sano', title: 'Sano' }),
        record({ slug: 'repetido', title: 'Segundo' }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(previewAt(data, 0)).toMatchObject({ slug: 'repetido', action: 'create' });
    expect(previewAt(data, 1)).toMatchObject({ slug: 'sano', action: 'create' });
    expect(previewAt(data, 2)).toMatchObject({ slug: 'repetido', action: 'error' });
    expect(errorAt(data, 2, 0)).toMatchObject({ code: 'DUPLICATE_SLUG_IN_FILE', field: 'slug' });
    expect(data.summary).toEqual({ total: 3, create: 2, update: 0, skip: 0, error: 1 });
  });

  it('no cuenta como tamaño válido el de una variante fuera del orden de prioridad', async () => {
    seedGlobalDictionary();
    addFakePlatform({ id: randomUUID(), tenantId: null, name: 'PS3', slug: 'ps3' });

    const { status, body } = await validate(
      envelope([
        record({
          slug: 'solo-ps3',
          title: 'Solo PS3',
          platformVariants: [{ platformSlug: 'ps3', sizeValue: 70, sizeUnit: 'GB' }],
        }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(previewAt(data, 0)).toMatchObject({ action: 'create', status: 'INCOMPLETE' });
  });

  it('no cuenta como portada una LibraryMedia que no está en estado OK', async () => {
    seedGlobalDictionary();
    const genre = [...state.genres.values()].find((row) => row.slug === 'indie')!;
    const platform = [...state.platforms.values()].find((row) => row.slug === 'pc')!;
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Portada Rota',
      slug: 'portada-rota',
      description: 'Tiene descripción',
      sizeValue: 4,
      sizeUnit: 'GB',
      status: 'INCOMPLETE',
    });
    addFakeBaseGameGenre(existente.id, genre.id);
    addFakeBaseGamePlatform(existente.id, platform.id, { sizeValue: 4, sizeUnit: 'GB' });
    addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: existente.id,
      kind: 'COVER',
      url: null,
      publicId: null,
      status: 'ERROR',
    });

    const { status, body } = await validate(
      envelope([
        record({
          slug: 'portada-rota',
          title: 'Portada Rota',
          description: 'Tiene descripción',
          coverUrl: undefined,
          categorySlug: undefined,
          genreSlugs: ['indie'],
          platformVariants: [{ platformSlug: 'pc', sizeValue: 4, sizeUnit: 'GB' }],
        }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(previewAt(data, 0)).toMatchObject({
      action: 'skip',
      status: 'INCOMPLETE',
      changes: [],
    });
  });

  it('no inventa un recommendedRequirements a partir del minimum del archivo', async () => {
    seedGlobalDictionary();
    addFakeBaseGame({
      id: randomUUID(),
      title: 'Curado',
      slug: 'curado',
      description: 'Descripción',
      sizeValue: 2,
      sizeUnit: 'GB',
      status: 'ACTIVE',
      minimumRequirements: null,
      recommendedRequirements: { cpu: 'Ryzen 9' },
    });

    const { status, body } = await validate(
      envelope([
        record({
          slug: 'curado',
          title: 'Curado',
          categorySlug: undefined,
          genreSlugs: undefined,
          minimumRequirements: { cpu: 'Intel i5' },
          platformVariants: [{ platformSlug: 'pc', sizeValue: 2, sizeUnit: 'GB' }],
        }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(previewAt(data, 0).changes).toContain('minimumRequirements');
    expect(previewAt(data, 0).changes).not.toContain('recommendedRequirements');
  });

  it('cambia el fingerprint si cambia un solo byte del archivo', async () => {
    seedGlobalDictionary();

    const primero = await validate(envelope([record({ slug: 'huella' })]));
    const segundo = await validate(
      envelope([record({ slug: 'huella', title: 'Otro título' })]),
    );

    expect(primero.body.data!.fingerprint).not.toBe(segundo.body.data!.fingerprint);
  });

  it('rechaza 400 si el envelope no trae games o excede el máximo', async () => {
    const sinGames = await validate({ schema: 'library-import@2', source: 'x' });
    const demasiados = await validate({
      schema: 'library-import@2',
      games: Array.from({ length: 5001 }, (_, index) => record({ slug: `juego-${index}` })),
    });

    expect(sinGames.status).toBe(400);
    expect(sinGames.body.error?.code).toBe('VALIDATION_ERROR');
    expect(demasiados.status).toBe(400);
    expect(demasiados.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('aguanta un archivo legal con muchísimos slugs de taxonomía distintos', async () => {
    seedGlobalDictionary();
    const games = Array.from({ length: 1200 }, (_, index) =>
      record({
        slug: `lote-${index}`,
        title: `Lote ${index}`,
        genreSlugs: [`desconocido-${index}`],
      }),
    );

    const { status, body } = await validate(envelope(games));

    expect(status).toBe(200);
    const data = body.data!;
    expect(data.summary).toEqual({
      total: 1200,
      create: 0,
      update: 0,
      skip: 0,
      error: 1200,
    });
    expect(data.taxonomy.missingGenres).toHaveLength(1200);
  });

  it('no escribe en ninguna tabla, no solo en baseGames', async () => {
    seedGlobalDictionary();
    const category = [...state.categories.values()].find((row) => row.slug === 'accion')!;
    const genre = [...state.genres.values()].find((row) => row.slug === 'indie')!;
    const platform = [...state.platforms.values()].find((row) => row.slug === 'pc')!;
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Existente',
      slug: 'existente',
      description: 'Roguelike de acción mitológico',
      categoryId: category.id,
      sizeValue: 15,
      sizeUnit: 'GB',
      status: 'ACTIVE',
    });
    addFakeBaseGameGenre(existente.id, genre.id);
    addFakeBaseGamePlatform(existente.id, platform.id, { sizeValue: 15, sizeUnit: 'GB' });
    addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: existente.id,
      kind: 'COVER',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/existente.jpg',
      publicId: 'library/games/existente/cover',
      status: 'OK',
    });

    const antes = snapshotTables();

    const { body } = await validate(
      envelope([
        record({ slug: 'nuevo', title: 'Nuevo' }),
        record({ slug: 'existente', title: 'Existente' }),
        record({
          slug: 'roto',
          title: 'Roto',
          coverUrl: undefined,
          genreSlugs: ['no-existe'],
          platformVariants: [{ platformSlug: 'pc' }],
        }),
      ]),
    );

    expect(body.data!.summary).toEqual({
      total: 3,
      create: 1,
      update: 0,
      skip: 1,
      error: 1,
    });
    expect(snapshotTables()).toEqual(antes);
  });
});

describe('POST /api/v1/admin/library-import/import — portadas', () => {
  it('reintenta la subida a Cloudinary y, si agota los intentos, deja la portada en ERROR', async () => {
    seedGlobalDictionary();
    fallarSubida = true;

    const { status, body } = await importar(
      envelope([record({ slug: 'subida-falla', title: 'Subida Falla' })]),
    );

    expect(status).toBe(200);
    expect(subidas).toHaveLength(3);
    expect(descargas).toHaveLength(1);

    const cover = [...state.libraryMedia.values()][0];
    expect(cover).toMatchObject({ kind: 'COVER', status: 'ERROR', url: null, publicId: null });
    expect(body.data!.warnings[0]).toContain('SUBIDA_FALLIDA');
    expect([...state.baseGames.values()][0]?.status).toBe('INCOMPLETE');
    expect([...state.baseGames.values()][0]?.title).toBe('Subida Falla');
    expect([...state.baseGames.values()][0]?.sizeValue).toBe(15);
  });

  it('el aviso de portada lleva el motivo concreto del fallo', async () => {
    seedGlobalDictionary();
    const htmlFalso = 'https://images.igdb.com/igdb/image/upload/t_cover_big/html.jpg';
    const muyGrande = 'https://images.igdb.com/igdb/image/upload/t_cover_big/grande.jpg';
    respuestaDescarga.set(htmlFalso, { result: 'error', detail: 'CONTENIDO_NO_PERMITIDO' });
    respuestaDescarga.set(muyGrande, { result: 'error', detail: 'DEMASIADO_GRANDE' });

    const { body } = await importar(
      envelope([
        record({ slug: 'html-falso', title: 'Html Falso', coverUrl: htmlFalso }),
        record({ slug: 'muy-grande', title: 'Muy Grande', coverUrl: muyGrande }),
      ]),
    );

    const avisos = body.data!.warnings;
    expect(avisos).toHaveLength(2);
    expect(avisos.some((aviso) => aviso.includes('CONTENIDO_NO_PERMITIDO'))).toBe(true);
    expect(avisos.some((aviso) => aviso.includes('DEMASIADO_GRANDE'))).toBe(true);
    for (const aviso of avisos) {
      expect(aviso).toContain('INCOMPLETE');
      expect(aviso).toContain('reintentará');
    }
  });

  it('descarga la portada, la sube a Cloudinary y guarda la URL de Cloudinary, nunca la de origen', async () => {
    seedGlobalDictionary();
    const coverUrl = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co24p8.jpg';

    const { status, body } = await importar(envelope([record({ slug: 'con-portada', coverUrl })]));

    expect(status).toBe(200);
    expect(descargas).toEqual([coverUrl]);
    expect(subidas).toEqual(['library/games/con-portada/cover']);

    const cover = [...state.libraryMedia.values()][0];
    expect(cover).toMatchObject({
      kind: 'COVER',
      sortOrder: 0,
      status: 'OK',
      publicId: 'library/games/con-portada/cover',
    });
    expect(cover?.url).toBe(
      'https://res.cloudinary.com/demo/image/upload/library/games/con-portada/cover.jpg',
    );
    expect(cover?.url).not.toContain('igdb');
    expect(body.data!.warnings).toEqual([]);
    expect([...state.baseGames.values()][0]?.status).toBe('ACTIVE');
  });

  it('rechaza hosts que no están en la allowlist sin bloquear la importación', async () => {
    seedGlobalDictionary();

    const { status, body } = await importar(
      envelope([
        record({
          slug: 'host-no-permitido',
          coverUrl: 'https://example.com/cover.jpg',
        }),
      ]),
    );

    expect(status).toBe(200);
    expect(descargas).toEqual([]);
    expect(subidas).toEqual([]);
    const cover = [...state.libraryMedia.values()][0];
    expect(cover).toMatchObject({ kind: 'COVER', status: 'ERROR', url: null, publicId: null });
    expect(body.data!.warnings[0]).toContain('host-no-permitido');
    expect([...state.baseGames.values()][0]?.status).toBe('INCOMPLETE');
    expect([...state.baseGames.values()][0]?.title).toBe('Hades');
  });

  it('degrada a INCOMPLETE cuando la descarga es bloqueada o falla', async () => {
    seedGlobalDictionary();
    const bloqueada = 'https://127.0.0.1/cover.jpg';
    const caida = 'https://images.igdb.com/igdb/image/upload/t_cover_big/caida.jpg';
    respuestaDescarga.set(bloqueada, { result: 'blocked', detail: 'DESTINO_BLOQUEADO' });
    respuestaDescarga.set(caida, { result: 'error', detail: 'HTTP_404' });

    const { status, body } = await importar(
      envelope([
        record({ slug: 'bloqueada', title: 'Bloqueada', coverUrl: bloqueada }),
        record({ slug: 'caida', title: 'Caida', coverUrl: caida }),
        record({ slug: 'sin-portada', title: 'Sin Portada', coverUrl: undefined }),
      ]),
    );

    expect(status).toBe(200);
    expect(body.data!.summary).toEqual({ create: 3, update: 0, skip: 0, error: 0 });
    expect(subidas).toEqual([]);

    const errores = [...state.libraryMedia.values()].filter((row) => row.status === 'ERROR');
    expect(errores).toHaveLength(2);
    expect(errores.map((row) => row.baseGameId).sort()).toEqual(
      [...state.baseGames.values()]
        .filter((row) => row.slug !== 'sin-portada')
        .map((row) => row.id)
        .sort(),
    );
    expect(state.baseGames.size).toBe(3);
    for (const row of state.baseGames.values()) {
      expect(row.status).toBe('INCOMPLETE');
    }
    expect(body.data!.warnings).toHaveLength(2);
  });

  it('no vuelve a descargar ni duplica la portada si ya está en OK', async () => {
    seedGlobalDictionary();
    const payload = envelope([
      record({ slug: 'ya-subida', title: 'Ya Subida', coverUrl: undefined }),
    ]);

    await importar(payload);
    const cover = addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: [...state.baseGames.values()][0]!.id,
      kind: 'COVER',
      url: 'https://res.cloudinary.com/demo/image/upload/library/games/ya-subida/cover.jpg',
      publicId: 'library/games/ya-subida/cover',
      status: 'OK',
    });

    const conPortada = envelope([
      record({
        slug: 'ya-subida',
        title: 'Ya Subida',
        coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/otra.jpg',
      }),
    ]);
    const { status } = await importar(conPortada);

    expect(status).toBe(200);
    expect(descargas).toEqual([]);
    expect(subidas).toEqual([]);
    expect(state.libraryMedia.size).toBe(1);
    expect(state.libraryMedia.get(cover.id)?.url).toContain('res.cloudinary.com');
  });

  it('reintenta una portada en ERROR y la deja en OK', async () => {
    seedGlobalDictionary();
    const coverUrl = 'https://images.igdb.com/igdb/image/upload/t_cover_big/retry.jpg';
    const payload = envelope([record({ slug: 'reintentable', title: 'Reintentable', coverUrl })]);
    respuestaDescarga.set(coverUrl, { result: 'error', detail: 'TIMEOUT' });

    await importar(payload);
    expect([...state.libraryMedia.values()][0]?.status).toBe('ERROR');

    respuestaDescarga.delete(coverUrl);
    const reintento = envelope([
      record({
        slug: 'reintentable',
        title: 'Reintentable',
        coverUrl,
        description: 'Ahora sí completa',
      }),
    ]);
    const { status } = await importar(reintento);

    expect(status).toBe(200);
    expect(state.libraryMedia.size).toBe(1);
    const cover = [...state.libraryMedia.values()][0];
    expect(cover?.status).toBe('OK');
    expect(cover?.url).toContain('res.cloudinary.com');
    expect([...state.baseGames.values()][0]?.status).toBe('ACTIVE');
  });
});

describe('POST /api/v1/admin/library-import/import', () => {
  it('devuelve stateFingerprint y rechaza el import si la biblioteca cambió tras el preview', async () => {
    seedGlobalDictionary();
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Hades viejo',
      slug: 'hades',
      description: 'Descripción previa',
      sizeValue: 15,
      sizeUnit: 'GB',
      status: 'INCOMPLETE',
    });
    const payload = envelope([record({ slug: 'hades', title: 'Hades' })]);
    const preview = await validate(payload);
    const previewData = preview.body.data!;

    expect(previewData.stateFingerprint).toMatch(/^[0-9a-f]{64}$/);

    addFakeBaseGame({
      id: randomUUID(),
      title: 'Intervenido por otro',
      slug: 'hades',
      description: 'Cambiado entre preview e import',
      sizeValue: 40,
      sizeUnit: 'GB',
      status: 'ACTIVE',
    });
    const despues = snapshotTables();

    const { status, body } = await importar(payload, {
      stateFingerprint: previewData.stateFingerprint,
    });

    expect(status).toBe(409);
    expect(body.error?.code).toBe('IMPORT_PREVIEW_STALE');
    expect(snapshotTables()).toEqual(despues);
    expect(state.baseGames.size).toBe(2);
    expect([...state.baseGames.values()].find((row) => row.id === existente.id)?.title).toBe(
      'Hades viejo',
    );
  });

  it('rechaza el import si el juego se dio de alta entre el preview y el import', async () => {
    seedGlobalDictionary();
    const payload = envelope([record({ slug: 'recien', title: 'Recién creado' })]);
    const preview = await validate(payload);
    expect(preview.body.data!.summary.create).toBe(1);

    addFakeBaseGame({
      id: randomUUID(),
      title: 'Creado por otro',
      slug: 'recien',
      description: 'Otro proceso',
      sizeValue: 5,
      sizeUnit: 'GB',
      status: 'INCOMPLETE',
    });
    const despues = snapshotTables();

    const { status, body } = await importar(payload, {
      stateFingerprint: preview.body.data!.stateFingerprint,
    });

    expect(status).toBe(409);
    expect(body.error?.code).toBe('IMPORT_PREVIEW_STALE');
    expect(snapshotTables()).toEqual(despues);
    expect(state.auditLogs.size).toBe(0);
  });

  it('detecta que la biblioteca cambió con la transacción ya abierta y no escribe nada', async () => {
    seedGlobalDictionary();
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Intervenido',
      slug: 'intervenido',
      description: 'Otra cosa',
      sizeValue: 7,
      sizeUnit: 'GB',
      status: 'INCOMPLETE',
    });
    const original = fakeDb.$transaction;
    fakeDb.$transaction = (async (arg: unknown, options: unknown) => {
      const fila = state.baseGames.get(existente.id);
      if (fila) fila.title = 'Cambiado justo antes de aplicar';
      return (original as (a: unknown, o: unknown) => Promise<unknown>)(arg, options);
    }) as typeof original;

    try {
      const { status, body } = await importar(
        envelope([record({ slug: 'intervenido', title: 'Intervenido nuevo' })]),
      );

      expect(status).toBe(409);
      expect(body.error?.code).toBe('IMPORT_PREVIEW_STALE');
      expect(state.auditLogs.size).toBe(0);
    } finally {
      fakeDb.$transaction = original;
    }
  });

  it('exige stateFingerprint en el body del import', async () => {
    seedGlobalDictionary();
    const payload = envelope([record({ slug: 'sin-huella' })]);
    const preview = await validate(payload);

    const { status, body } = await api<ImportData>(
      IMPORT,
      {
        method: 'POST',
        body: JSON.stringify({
          envelope: payload,
          fingerprint: preview.body.data!.fingerprint,
        }),
      },
      superToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('aplica create/update/skip con auditoría por registro sin tocar las ofertas ajenas a la biblioteca', async () => {
    seedGlobalDictionary();
    const category = [...state.categories.values()].find((row) => row.slug === 'accion')!;
    const genre = [...state.genres.values()].find((row) => row.slug === 'indie')!;
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Hades viejo',
      slug: 'hades',
      description: 'Descripción previa',
      sizeValue: 15,
      sizeUnit: 'GB',
      status: 'INCOMPLETE',
    });
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      title: 'Oferta intacta',
      slug: 'oferta-intacta',
      sizeValue: 1,
      sizeUnit: 'GB',
    });

    const { status, body } = await importar(
      envelope([
        record({ slug: 'nuevo', title: 'Juego Nuevo' }),
        record({ slug: 'hades', title: 'Hades' }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(data.summary).toEqual({ create: 1, update: 1, skip: 0, error: 0 });
    expect(data.records.map((row) => row.action)).toEqual(['create', 'update']);

    const creado = [...state.baseGames.values()].find((row) => row.slug === 'nuevo');
    expect(creado?.title).toBe('Juego Nuevo');
    expect(creado?.status).toBe('ACTIVE');
    expect(creado?.categoryId).toBe(category.id);
    const actualizado = state.baseGames.get(existente.id);
    expect(actualizado?.title).toBe('Hades');
    expect(actualizado?.status).toBe('ACTIVE');

    expect(state.auditLogs.size).toBe(2);
    const audits = [...state.auditLogs.values()];
    expect(audits.map((row) => row.action).sort()).toEqual(['CREATE', 'UPDATE']);
    expect(audits.every((row) => row.entity === 'BaseGame')).toBe(true);
    expect(audits[0]?.metadata).toMatchObject({ schema: 'library-import@2' });
    expect(data.records.every((row) => typeof row.auditId === 'string')).toBe(true);

    const oferta = [...state.tenantGames.values()][0];
    expect(oferta?.title).toBe('Oferta intacta');
    expect(state.tenantGames.size).toBe(1);
    const genero = [...state.baseGameGenres.values()];
    expect(genero.some((link) => link.genreId === genre.id)).toBe(true);
  });

  it('refresca la descripción y los requisitos de los juegos ya publicados en el catálogo', async () => {
    seedGlobalDictionary();
    const archivo = envelope([
      record({
        slug: 'hades',
        title: 'Hades',
        description: 'Roguelike de acción mitológico',
        minimumRequirements: { os: 'Windows 10', cpu: 'Intel Core i5', ram: '8 GB' },
        recommendedRequirements: { os: 'Windows 11', cpu: 'Intel Core i7', ram: '16 GB' },
      }),
    ]);

    const primera = await importar(archivo);
    expect(primera.status).toBe(200);
    expect(primera.body.data!.summary).toEqual({ create: 1, update: 0, skip: 0, error: 0 });

    const base = [...state.baseGames.values()].find((row) => row.slug === 'hades')!;
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      baseGameId: base.id,
      origin: 'BIBLIOTECA',
      title: 'Hades (título del catálogo)',
      slug: 'hades',
      description: 'Old english copy',
      sizeValue: 42,
      sizeUnit: 'GB',
      minimumRequirements: { os: 'Windows 8' },
      recommendedRequirements: { os: 'Windows 8' },
    });

    // El archivo no cambió: la biblioteca ya está al día y el import no escribe
    // nada en baseGames, pero la copia del catálogo sigue con el texto anterior.
    const segunda = await importar(archivo);
    expect(segunda.status).toBe(200);
    expect(segunda.body.data!.summary).toEqual({ create: 0, update: 0, skip: 1, error: 0 });

    const oferta = [...state.tenantGames.values()].find((row) => row.slug === 'hades')!;
    const biblioteca = state.baseGames.get(base.id)!;
    expect(oferta.description).toBe(biblioteca.description);
    expect(oferta.minimumRequirements).toEqual(biblioteca.minimumRequirements);
    expect(oferta.recommendedRequirements).toEqual(biblioteca.recommendedRequirements);

    // Lo comercial y lo curado a mano del catálogo no se tocan.
    expect(oferta.title).toBe('Hades (título del catálogo)');
    expect(oferta.sizeValue).toBe(42);

    expect(segunda.body.data!.warnings).toEqual([
      expect.stringContaining('descripción y los requisitos'),
    ]);
    expect(
      [...state.auditLogs.values()].some(
        (row) =>
          row.entity === 'TenantGame' &&
          JSON.stringify(row.metadata ?? {}).includes('catalogSync'),
      ),
    ).toBe(true);
  });

  it('no crea copias nuevas ni borra texto cuando la biblioteca no tiene valor', async () => {
    seedGlobalDictionary();
    const archivo = envelope([
      record({ slug: 'hades', description: 'Roguelike de acción mitológico' }),
      record({
        slug: 'celeste',
        title: 'Celeste',
        description: null,
        minimumRequirements: null,
        recommendedRequirements: null,
      }),
    ]);

    const { status } = await importar(archivo);
    expect(status).toBe(200);

    const hades = [...state.baseGames.values()].find((row) => row.slug === 'hades')!;
    const celeste = [...state.baseGames.values()].find((row) => row.slug === 'celeste')!;

    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      baseGameId: hades.id,
      origin: 'BIBLIOTECA',
      title: 'Hades',
      slug: 'hades',
      description: null,
    });
    addFakeTenantGame({
      id: randomUUID(),
      tenantId: T_JAVIER,
      baseGameId: celeste.id,
      origin: 'BIBLIOTECA',
      title: 'Celeste',
      slug: 'celeste',
      description: 'Texto curado en inglés',
      minimumRequirements: { os: 'Windows 8' },
      recommendedRequirements: { os: 'Windows 8' },
    });

    const segunda = await importar(archivo);
    expect(segunda.status).toBe(200);
    expect(segunda.body.data!.warnings).toEqual([]);

    const sinCopia = [...state.tenantGames.values()].find((row) => row.slug === 'hades')!;
    expect(sinCopia.description).toBeNull();
    expect(sinCopia.minimumRequirements).toBeNull();

    // La biblioteca no tiene descripción ni requisitos: no se borra lo curado.
    const conTexto = [...state.tenantGames.values()].find((row) => row.slug === 'celeste')!;
    expect(conTexto.description).toBe('Texto curado en inglés');
    expect(conTexto.minimumRequirements).toEqual({ os: 'Windows 8' });
    expect(conTexto.recommendedRequirements).toEqual({ os: 'Windows 8' });
  });

  it('no borra datos buenos: ausente o null no cambian nada y presente sobreescribe', async () => {
    seedGlobalDictionary();
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Curado',
      slug: 'curado',
      description: 'Descripción que se conserva',
      developer: 'Estudio que se conserva',
      releaseYear: 2015,
      sizeValue: 12,
      sizeUnit: 'GB',
      status: 'ACTIVE',
    });
    addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: existente.id,
      kind: 'COVER',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/curado.jpg',
      publicId: 'library/games/curado/cover',
      status: 'OK',
    });

    const { status } = await importar(
      envelope([
        record({
          slug: 'curado',
          title: 'Curado',
          description: null,
          releaseYear: undefined,
          developer: 'Estudio Actualizado',
          keywords: undefined,
          genreSlugs: undefined,
          categorySlug: undefined,
          coverUrl: undefined,
          platformVariants: [{ platformSlug: 'pc' }],
        }),
      ]),
    );

    expect(status).toBe(200);
    const row = state.baseGames.get(existente.id);
    expect(row?.description).toBe('Descripción que se conserva');
    expect(row?.releaseYear).toBe(2015);
    expect(row?.developer).toBe('Estudio Actualizado');
    expect(row?.sizeValue).toBe(12);
    expect(row?.status).toBe('ACTIVE');
  });

  it('reemplaza el conjunto de géneros solo si el archivo los trae, y conserva variantes no listadas', async () => {
    seedGlobalDictionary();
    const indie = [...state.genres.values()].find((row) => row.slug === 'indie')!;
    const rol = [...state.genres.values()].find((row) => row.slug === 'rol')!;
    const pc = [...state.platforms.values()].find((row) => row.slug === 'pc')!;
    const ps5 = [...state.platforms.values()].find((row) => row.slug === 'ps5')!;
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Multigénero',
      slug: 'multigenero',
      description: 'Descripción',
      sizeValue: 8,
      sizeUnit: 'GB',
      status: 'ACTIVE',
    });
    addFakeBaseGameGenre(existente.id, indie.id);
    addFakeBaseGameGenre(existente.id, rol.id);
    addFakeBaseGamePlatform(existente.id, pc.id, { sizeValue: 8, sizeUnit: 'GB' });
    addFakeBaseGamePlatform(existente.id, ps5.id, { sizeValue: 20, sizeUnit: 'GB' });

    const { status } = await importar(
      envelope([
        record({
          slug: 'multigenero',
          title: 'Multigénero',
          genreSlugs: ['indie'],
          platformVariants: [{ platformSlug: 'pc', sizeValue: 9, sizeUnit: 'GB' }],
        }),
      ]),
    );

    expect(status).toBe(200);
    const genreIds = [...state.baseGameGenres.values()]
      .filter((link) => link.baseGameId === existente.id)
      .map((link) => link.genreId);
    expect(genreIds).toEqual([indie.id]);

    const variantes = [...state.baseGamePlatforms.values()].filter(
      (link) => link.baseGameId === existente.id,
    );
    expect(variantes).toHaveLength(2);
    expect(variantes.find((link) => link.platformId === pc.id)?.sizeValue).toBe(9);
    expect(variantes.find((link) => link.platformId === ps5.id)?.sizeValue).toBe(20);
  });

  it('revive un juego borrado lógicamente', async () => {
    seedGlobalDictionary();
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Zombie',
      slug: 'zombie',
      description: 'Descripción',
      sizeValue: 3,
      sizeUnit: 'GB',
      status: 'ACTIVE',
      deletedAt: new Date(),
    });

    const { status } = await importar(envelope([record({ slug: 'zombie' })]));

    expect(status).toBe(200);
    expect(state.baseGames.get(existente.id)?.deletedAt).toBeNull();
  });

  it('estampa source solo al crear y no lo pisa en una actualización', async () => {
    seedGlobalDictionary();
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Legado',
      slug: 'legado',
      description: 'Descripción',
      sizeValue: 4,
      sizeUnit: 'GB',
      status: 'ACTIVE',
      source: 'importado-a-mano',
    });

    await importar(
      envelope([
        record({ slug: 'legado', title: 'Legado renovado' }),
        record({ slug: 'nuevo', title: 'Nuevo' }),
      ]),
    );

    expect(state.baseGames.get(existente.id)?.source).toBe('importado-a-mano');
    expect([...state.baseGames.values()].find((row) => row.slug === 'nuevo')?.source).toBe(
      'library-import@2',
    );
  });

  it('excluye los registros con error y aplica el resto', async () => {
    seedGlobalDictionary();

    const { status, body } = await importar(
      envelope([
        record({ slug: 'sano', title: 'Sano' }),
        record({ slug: 'malo', genreSlugs: ['no-existe'] }),
      ]),
    );

    expect(status).toBe(200);
    const data = body.data!;
    expect(data.summary).toEqual({ create: 1, update: 0, skip: 0, error: 1 });
    expect(errorAtImport(data, 1).code).toBe('TAXONOMY_GENRE_UNKNOWN');
    expect([...state.baseGames.values()].some((row) => row.slug === 'malo')).toBe(false);
    expect([...state.baseGames.values()].some((row) => row.slug === 'sano')).toBe(true);
  });

  it('rechaza 409 si el fingerprint no corresponde al envelope recibido', async () => {
    seedGlobalDictionary();
    const antes = snapshotTables();

    const { status, body } = await importar(envelope([record({ slug: 'huella' })]), {
      fingerprint: 'a'.repeat(64),
    });

    expect(status).toBe(409);
    expect(body.error?.code).toBe('FINGERPRINT_MISMATCH');
    expect(snapshotTables()).toEqual(antes);
  });

  it('reimportar el mismo archivo no escribe nada', async () => {
    seedGlobalDictionary();
    const payload = envelope([
      record({ slug: 'idempotente', title: 'Idempotente', coverUrl: undefined }),
    ]);

    const primera = await importar(payload);
    expect(primera.body.data!.summary.create).toBe(1);
    const despues = snapshotTables();

    const segunda = await importar(payload);

    expect(segunda.status).toBe(200);
    expect(segunda.body.data!.summary).toEqual({ create: 0, update: 0, skip: 1, error: 0 });
    expect(snapshotTables()).toEqual(despues);
  });

  it('importa la portada en la primera pasada y no vuelve a descargarla al reimportar', async () => {
    seedGlobalDictionary();
    const payload = envelope([record({ slug: 'con-portada', title: 'Con Portada' })]);

    const primera = await importar(payload);
    expect(primera.body.data!.summary.create).toBe(1);
    expect(primera.body.data!.warnings).toEqual([]);
    expect(descargas).toHaveLength(1);
    expect([...state.libraryMedia.values()][0]?.status).toBe('OK');

    const segunda = await importar(payload);

    expect(segunda.status).toBe(200);
    expect(segunda.body.data!.summary).toEqual({ create: 0, update: 0, skip: 1, error: 0 });
    expect(segunda.body.data!.warnings).toEqual([]);
    expect(descargas).toHaveLength(1);
    expect(state.libraryMedia.size).toBe(1);
  });

  it('deshace todo el lote si falla un registro por error de sistema', async () => {
    seedGlobalDictionary();
    const antes = snapshotTables();
    const original = fakeDb.baseGame.create;
    let llamadas = 0;
    fakeDb.baseGame.create = (async (args: Parameters<typeof original>[0]) => {
      llamadas += 1;
      if (llamadas === 2) throw new Error('fallo de sistema simulado');
      return original(args);
    }) as typeof original;

    try {
      const { status } = await importar(
        envelope([
          record({ slug: 'uno', title: 'Uno' }),
          record({ slug: 'dos', title: 'Dos' }),
          record({ slug: 'tres', title: 'Tres' }),
        ]),
      );

      expect(status).toBe(500);
    } finally {
      fakeDb.baseGame.create = original;
    }

    expect(snapshotTables()).toEqual(antes);
  });

  it('trata las cadenas vacías como ausentes: no borran texto curado ni degradan el estado', async () => {
    seedGlobalDictionary();
    const existente = addFakeBaseGame({
      id: randomUUID(),
      title: 'Curado',
      slug: 'curado',
      description: 'Descripción curada a mano',
      developer: 'Estudio X',
      publisher: 'Editor Y',
      keywords: 'roguelike, metroidvania',
      sizeValue: 15,
      sizeUnit: 'GB',
      status: 'ACTIVE',
    });
    addFakeLibraryMedia({
      id: randomUUID(),
      baseGameId: existente.id,
      kind: 'COVER',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/curado.jpg',
      publicId: 'library/games/curado/cover',
      status: 'OK',
    });

    const { status } = await importar(
      envelope([
        record({
          slug: 'curado',
          title: 'Curado',
          description: '',
          developer: '',
          publisher: '',
          keywords: '   ',
          categorySlug: undefined,
          genreSlugs: undefined,
          coverUrl: undefined,
          platformVariants: [{ platformSlug: 'pc', sizeValue: 15, sizeUnit: 'GB' }],
        }),
      ]),
    );

    expect(status).toBe(200);
    const row = state.baseGames.get(existente.id);
    expect(row?.description).toBe('Descripción curada a mano');
    expect(row?.developer).toBe('Estudio X');
    expect(row?.publisher).toBe('Editor Y');
    expect(row?.keywords).toBe('roguelike, metroidvania');
    expect(row?.status).toBe('ACTIVE');
  });

  it('exige el mismo control de acceso que validate', async () => {
    const body = JSON.stringify({ envelope: envelope([]), fingerprint: 'a'.repeat(64) });
    const sinToken = await api(IMPORT, { method: 'POST', body });
    const comoAdmin = await api(IMPORT, { method: 'POST', body }, adminToken);

    expect(sinToken.status).toBe(401);
    expect(comoAdmin.status).toBe(403);
    expect(comoAdmin.body.error?.code).toBe('FORBIDDEN');
  });
});

function errorAtImport(data: ImportData, index: number): RecordError {
  const record = data.records[index];
  if (!record) throw new Error(`Falta el registro ${index} en la respuesta de import`);
  const error = record.errors[0];
  if (!error) throw new Error(`Falta el error del registro ${index}`);
  return error;
}

function snapshotTables() {
  const clone = (rows: Map<string, unknown>): unknown[] =>
    structuredClone([...rows.entries()]);

  return {
    users: clone(state.users),
    sessions: clone(state.sessions),
    tenants: clone(state.tenants),
    tenantSettings: clone(state.tenantSettings),
    auditLogs: clone(state.auditLogs),
    categories: clone(state.categories),
    genres: clone(state.genres),
    platforms: clone(state.platforms),
    baseGames: clone(state.baseGames),
    tenantGames: clone(state.tenantGames),
    baseGameGenres: clone(state.baseGameGenres),
    baseGamePlatforms: clone(state.baseGamePlatforms),
    tenantGameGenres: clone(state.tenantGameGenres),
    gamePlatforms: clone(state.gamePlatforms),
    gameMedia: clone(state.gameMedia),
    libraryMedia: clone(state.libraryMedia),
    pricingRules: clone(state.pricingRules),
    catalogMetadata: clone(state.catalogMetadata),
    backups: clone(state.backups),
    tenantPlatforms: clone(state.tenantPlatforms),
  };
}
