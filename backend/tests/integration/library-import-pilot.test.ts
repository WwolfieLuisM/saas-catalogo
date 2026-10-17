import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakeCategory,
  addFakeGenre,
  addFakePlatform,
  addFakeUser,
  resetFakeDb,
  state,
} from '../helpers/fakeDb.js';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb: db } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => db, closePrisma: async () => undefined };
});

vi.mock('../../src/utils/safeUrl.js', () => ({
  safeGetImage: vi.fn(async () => ({
    result: 'ok',
    detail: null,
    buffer: Buffer.from('bytes-de-portada'),
    contentType: 'image/jpeg',
    httpStatus: 200,
  })),
}));

vi.mock('../../src/config/cloudinary.js', () => ({
  uploadImage: vi.fn(async ({ publicId }: { buffer: Buffer; publicId: string }) => ({
    url: `https://res.cloudinary.com/demo/image/upload/${publicId}.jpg`,
    publicId,
  })),
  destroyImage: vi.fn(async () => undefined),
  listImages: vi.fn(async () => []),
}));

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scripts',
  'library-import.json',
);

const VALIDATE = '/api/v1/admin/library-import/validate';
const IMPORT = '/api/v1/admin/library-import/import';

const GENRES_PILOTO = [
  'arcade',
  'aventura',
  'carreras',
  'cartas',
  'deportes',
  'estrategia',
  'indie',
  'lucha',
  'musica',
  'plataformas',
  'puzzle',
  'rol',
  'shooter',
  'simulacion',
];

const CATEGORIAS_PILOTO = [
  'accion',
  'aventura',
  'deportes',
  'puzzle',
  'rol',
  'sigilo',
  'simulacion',
  'terror',
];

const PLATAFORMAS_PILOTO = [
  'pc',
  'ps4',
  'ps5',
  'switch',
  'xbox-one',
  'xbox-series-x',
];

interface PilotRecordV1 {
  title?: unknown;
  slug?: unknown;
  description?: unknown;
  releaseYear?: unknown;
  developer?: unknown;
  publisher?: unknown;
  keywords?: unknown;
  genreSlugs?: unknown;
  platformSlugs?: unknown;
  status?: unknown;
  coverUrl?: unknown;
  sizeValue?: unknown;
  sizeUnit?: unknown;
}

function toV2(raw: PilotRecordV1): Record<string, unknown> {
  const { status: _status, platformSlugs, ...rest } = raw;
  const slugs = Array.isArray(platformSlugs) ? (platformSlugs as string[]) : [];
  const primary = slugs[0];
  const platformVariants = slugs.map((platformSlug, index) =>
    index === 0 && typeof raw.sizeValue === 'number' && typeof raw.sizeUnit === 'string'
      ? { platformSlug, sizeValue: raw.sizeValue, sizeUnit: raw.sizeUnit }
      : { platformSlug },
  );

  return {
    ...rest,
    ...(primary ? { platformVariants } : {}),
  };
}

function buildPilotEnvelope(): unknown {
  const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
    generatedAt?: string;
    source?: string;
    games: PilotRecordV1[];
  };

  return {
    schema: 'library-import@2',
    generatedAt: raw.generatedAt,
    source: `${raw.source ?? 'piloto'} (migrado de library-import@1 en el test)`,
    games: raw.games.map(toV2),
  };
}

let server: Server;
let baseUrl: string;
let superToken: string;

async function api<T>(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${superToken}` },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: (await response.json()) as { success: boolean; data?: T; error?: { code: string; message: string } } };
}

function seedPilotDictionary() {
  for (const slug of GENRES_PILOTO) {
    addFakeGenre({ id: randomUUID(), tenantId: null, name: slug, slug });
  }
  for (const slug of CATEGORIAS_PILOTO) {
    addFakeCategory({ id: randomUUID(), tenantId: null, name: slug, slug });
  }
  for (const slug of PLATAFORMAS_PILOTO) {
    addFakePlatform({ id: randomUUID(), tenantId: null, name: slug, slug });
  }
}

beforeAll(async () => {
  const { createApp } = await import('../../src/app.js');
  server = createApp().listen(0);
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  superToken = await signAccessToken({ id: 'u-super', role: 'SUPER_ADMIN', tenantId: null });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetFakeDb();
  addFakeUser({ id: 'u-super', username: 'root', role: 'SUPER_ADMIN', tenantId: null });
  seedPilotDictionary();
});

interface PreviewData {
  fingerprint: string;
  stateFingerprint: string;
  summary: { total: number; create: number; update: number; skip: number; error: number };
  records: Array<{ slug: string | null; action: string; status: string | null; errors: Array<{ code: string; field: string; message: string }> }>;
  taxonomy: { missingGenres: string[]; missingCategories: string[]; missingPlatforms: string[] };
}

function pilotSlugsWithoutSize(): string[] {
  const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { games: PilotRecordV1[] };
  return raw.games
    .filter((game) => typeof game.sizeValue !== 'number' || typeof game.sizeUnit !== 'string')
    .map((game) => String(game.slug))
    .sort();
}

const describePilot = existsSync(FIXTURE) ? describe : describe.skip;

describePilot('piloto real library-import@1 migrado a @2', () => {
  it('el piloto entero valida sin un solo error de registro', async () => {
    const envelope = buildPilotEnvelope();

    const { status, body } = await api<PreviewData>(VALIDATE, envelope);
    const data = body.data!;

    expect(status).toBe(200);
    const fallidos = data.records.filter((row) => row.action === 'error');
    expect(
      fallidos.map((row) => `${row.slug}: ${row.errors.map((e) => `${e.code}@${e.field} ${e.message}`).join(' | ')}`),
    ).toEqual([]);
    expect(data.taxonomy.missingGenres).toEqual([]);
    expect(data.taxonomy.missingCategories).toEqual([]);
    expect(data.taxonomy.missingPlatforms).toEqual([]);
    expect(data.summary.error).toBe(0);
    expect(data.summary.total).toBe(50);
    expect(data.summary.create).toBe(50);
    expect(data.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(data.stateFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('marca INCOMPLETE exactamente a los juegos que el piloto dejó sin tamaño', async () => {
    const envelope = buildPilotEnvelope();
    const { body } = await api<PreviewData>(VALIDATE, envelope);
    const sinTamano = pilotSlugsWithoutSize();
    const incompletos = body.data!.records
      .filter((row) => row.status !== 'ACTIVE')
      .map((row) => String(row.slug))
      .sort();

    expect(incompletos).toEqual(sinTamano);
  });

  it('el piloto entero se importa y cada juego queda con su portada en Cloudinary', async () => {
    const envelope = buildPilotEnvelope();
    const preview = await api<PreviewData>(VALIDATE, envelope);

    const { status, body } = await api<{ summary: { create: number; error: number }; warnings: string[] }>(
      IMPORT,
      {
        envelope,
        fingerprint: preview.body.data!.fingerprint,
        stateFingerprint: preview.body.data!.stateFingerprint,
      },
    );

    expect(status).toBe(200);
    expect(body.data!.summary).toEqual({ create: 50, update: 0, skip: 0, error: 0 });
    expect(state.baseGames.size).toBe(50);
    expect(state.auditLogs.size).toBe(50);
    expect(state.baseGamePlatforms.size).toBeGreaterThanOrEqual(50);
    expect(body.data!.warnings).toEqual([]);
    expect(state.libraryMedia.size).toBe(50);
    expect([...state.libraryMedia.values()].every((row) => row.status === 'OK')).toBe(true);
    expect(
      [...state.libraryMedia.values()].every((row) =>
        row.url?.startsWith('https://res.cloudinary.com/'),
      ),
    ).toBe(true);
    expect(
      [...state.libraryMedia.values()].some((row) => row.url?.includes('igdb')),
    ).toBe(false);

    const statuses = [...state.baseGames.values()].map((row) => row.status);
    expect(statuses.filter((status) => status === 'ACTIVE')).toHaveLength(
      50 - pilotSlugsWithoutSize().length,
    );
    expect(statuses.filter((status) => status === 'INCOMPLETE')).toHaveLength(
      pilotSlugsWithoutSize().length,
    );

    const genresUnicos = new Set([...state.baseGameGenres.values()].map((link) => link.genreId));
    expect(genresUnicos.size).toBeGreaterThan(0);
  });
});