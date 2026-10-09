import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  addFakeAuditLog,
  addFakeCatalogMetadata,
  addFakeGameMedia,
  addFakeSession,
  addFakeTenant,
  addFakeTenantGame,
  addFakeUser,
  resetFakeDb,
} from '../helpers/fakeDb.js';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => fakeDb, closePrisma: async () => undefined };
});

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface DashboardData {
  totalGames: number;
  availableGames: number;
  unavailableGames: number;
  libraryGames: number;
  customGames: number;
  mediaErrors: number;
  orphanMedia: number;
  activeSessions: number;
  recentAuditEvents: number;
  catalogVersion: number | null;
}

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;
let adminOtroToken: string;

const TENANT_JAVIER = '11111111-1111-4111-8111-111111111111';
const TENANT_OTRO = '22222222-2222-4222-8222-222222222222';
const USER_SUPER = '33333333-3333-4333-8333-333333333333';
const USER_ADMIN = '55555555-5555-4555-8555-555555555555';
const USER_ADMIN_OTRO = '66666666-6666-4666-8666-666666666666';

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
  superToken = await signAccessToken({ id: USER_SUPER, role: 'SUPER_ADMIN', tenantId: null });
  adminToken = await signAccessToken({
    id: USER_ADMIN,
    role: 'ADMIN',
    tenantId: TENANT_JAVIER,
  });
  adminOtroToken = await signAccessToken({
    id: USER_ADMIN_OTRO,
    role: 'ADMIN',
    tenantId: TENANT_OTRO,
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetFakeDb();
  addFakeTenant({ id: TENANT_JAVIER, name: 'Javier', slug: 'javier' });
  addFakeTenant({ id: TENANT_OTRO, name: 'Otro', slug: 'otro' });
  addFakeUser({
    id: USER_SUPER,
    username: 'root',
    role: 'SUPER_ADMIN',
    tenantId: null,
  });
  addFakeUser({
    id: USER_ADMIN,
    username: 'javier-admin',
    role: 'ADMIN',
    tenantId: TENANT_JAVIER,
  });
  addFakeUser({
    id: USER_ADMIN_OTRO,
    username: 'otro-admin',
    role: 'ADMIN',
    tenantId: TENANT_OTRO,
  });

  addFakeTenantGame({
    id: 'g1',
    tenantId: TENANT_JAVIER,
    title: 'Juego 1',
    slug: 'juego-1',
    origin: 'BIBLIOTECA',
    availability: true,
  });
  addFakeTenantGame({
    id: 'g2',
    tenantId: TENANT_JAVIER,
    title: 'Juego 2',
    slug: 'juego-2',
    origin: 'BIBLIOTECA',
    availability: false,
  });
  addFakeTenantGame({
    id: 'g3',
    tenantId: TENANT_JAVIER,
    title: 'Juego 3',
    slug: 'juego-3',
    origin: 'PERSONALIZADO',
    availability: true,
  });
  addFakeTenantGame({
    id: 'g4',
    tenantId: TENANT_JAVIER,
    title: 'Juego 4',
    slug: 'juego-4',
    origin: 'PERSONALIZADO',
    availability: true,
    deletedAt: new Date(),
  });
  addFakeTenantGame({
    id: 'g5',
    tenantId: TENANT_OTRO,
    title: 'Juego 5',
    slug: 'juego-5',
    origin: 'BIBLIOTECA',
    availability: true,
  });

  addFakeGameMedia({
    id: 'm1',
    tenantId: TENANT_JAVIER,
    gameId: 'g1',
    kind: 'COVER',
    status: 'ERROR',
  });
  addFakeGameMedia({
    id: 'm2',
    tenantId: TENANT_JAVIER,
    gameId: 'g2',
    kind: 'SHOT',
    status: 'ORPHAN',
  });
  addFakeGameMedia({
    id: 'm3',
    tenantId: TENANT_JAVIER,
    gameId: 'g3',
    kind: 'COVER',
    status: 'OK',
  });
  addFakeGameMedia({
    id: 'm4',
    tenantId: TENANT_OTRO,
    gameId: 'g5',
    kind: 'COVER',
    status: 'ERROR',
  });

  addFakeSession({ id: 's-act', adminId: USER_ADMIN, tokenHash: 'h-act' });
  addFakeSession({
    id: 's-rev',
    adminId: USER_ADMIN,
    tokenHash: 'h-rev',
    revokedAt: new Date(),
  });
  addFakeSession({
    id: 's-exp',
    adminId: USER_ADMIN,
    tokenHash: 'h-exp',
    expiresAt: new Date(Date.now() - 3600_000),
  });
  addFakeSession({ id: 's-otro', adminId: USER_ADMIN_OTRO, tokenHash: 'h-otro' });

  addFakeAuditLog({
    id: 'a-recent',
    action: 'CREATE',
    entity: 'AdminUser',
    tenantId: TENANT_JAVIER,
    actorId: USER_ADMIN,
    timestamp: new Date(Date.now() - 3600_000),
  });
  addFakeAuditLog({
    id: 'a-old',
    action: 'UPDATE',
    entity: 'TenantGame',
    tenantId: TENANT_JAVIER,
    actorId: USER_ADMIN,
    timestamp: new Date(Date.now() - 48 * 3600_000),
  });
  addFakeAuditLog({
    id: 'a-plat',
    action: 'TENANT_CREATED',
    entity: 'Tenant',
    tenantId: null,
    actorId: USER_SUPER,
    timestamp: new Date(Date.now() - 2 * 3600_000),
  });
  addFakeAuditLog({
    id: 'a-otro',
    action: 'CREATE',
    entity: 'AdminUser',
    tenantId: TENANT_OTRO,
    actorId: USER_ADMIN_OTRO,
    timestamp: new Date(Date.now() - 3600_000),
  });

  addFakeCatalogMetadata({ id: 'c-javier', tenantId: TENANT_JAVIER, version: 7 });
});

describe('GET /api/v1/admin/dashboard', () => {
  it('devuelve 401 sin token', async () => {
    const { status, body } = await api('/api/v1/admin/dashboard');

    expect(status).toBe(401);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve exactamente los 10 campos de la especificación para ADMIN', async () => {
    const { status, body } = await api<DashboardData>('/api/v1/admin/dashboard', {}, adminToken);

    expect(status).toBe(200);
    expect(Object.keys(body.data ?? {}).sort()).toEqual(
      [
        'totalGames',
        'availableGames',
        'unavailableGames',
        'libraryGames',
        'customGames',
        'mediaErrors',
        'orphanMedia',
        'activeSessions',
        'recentAuditEvents',
        'catalogVersion',
      ].sort(),
    );
  });

  it('ADMIN solo ve los conteos de su tenant contrastados con los datos', async () => {
    const { status, body } = await api<DashboardData>('/api/v1/admin/dashboard', {}, adminToken);

    expect(status).toBe(200);
    expect(body.data).toEqual({
      totalGames: 3,
      availableGames: 2,
      unavailableGames: 1,
      libraryGames: 2,
      customGames: 1,
      mediaErrors: 1,
      orphanMedia: 1,
      activeSessions: 1,
      recentAuditEvents: 1,
      catalogVersion: 7,
    });
  });

  it('ADMIN recibe 403 al pedir otro tenant y acepta el propio', async () => {
    const ajeno = await api(`/api/v1/admin/dashboard?tenantId=${TENANT_OTRO}`, {}, adminToken);
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.error?.code).toBe('FORBIDDEN');

    const propio = await api<DashboardData>(
      `/api/v1/admin/dashboard?tenantId=${TENANT_JAVIER}`,
      {},
      adminToken,
    );
    expect(propio.status).toBe(200);
    expect(propio.body.data?.totalGames).toBe(3);
  });

  it('el ADMIN de otro tenant solo ve los suyos', async () => {
    const { status, body } = await api<DashboardData>(
      '/api/v1/admin/dashboard',
      {},
      adminOtroToken,
    );

    expect(status).toBe(200);
    expect(body.data).toEqual({
      totalGames: 1,
      availableGames: 1,
      unavailableGames: 0,
      libraryGames: 1,
      customGames: 0,
      mediaErrors: 1,
      orphanMedia: 0,
      activeSessions: 1,
      recentAuditEvents: 1,
      catalogVersion: null,
    });
  });

  it('SUPER_ADMIN agrega el global sin tenant', async () => {
    const { status, body } = await api<DashboardData>('/api/v1/admin/dashboard', {}, superToken);

    expect(status).toBe(200);
    expect(body.data).toEqual({
      totalGames: 4,
      availableGames: 3,
      unavailableGames: 1,
      libraryGames: 3,
      customGames: 1,
      mediaErrors: 2,
      orphanMedia: 1,
      activeSessions: 2,
      recentAuditEvents: 3,
      catalogVersion: null,
    });
  });

  it('SUPER_ADMIN con ?tenantId=uuid devuelve los conteos de ese tenant', async () => {
    const { status, body } = await api<DashboardData>(
      `/api/v1/admin/dashboard?tenantId=${TENANT_JAVIER}`,
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data).toEqual({
      totalGames: 3,
      availableGames: 2,
      unavailableGames: 1,
      libraryGames: 2,
      customGames: 1,
      mediaErrors: 1,
      orphanMedia: 1,
      activeSessions: 1,
      recentAuditEvents: 1,
      catalogVersion: 7,
    });
  });

  it('devuelve 422 si el tenant indicado no existe', async () => {
    const { status, body } = await api(
      '/api/v1/admin/dashboard?tenantId=00000000-0000-4000-8000-000000000000',
      {},
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('devuelve 400 si tenantId no es un uuid', async () => {
    const { status, body } = await api('/api/v1/admin/dashboard?tenantId=no-uuid', {}, superToken);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('sin datos devuelve conteos en cero y catalogVersion null', async () => {
    resetFakeDb();
    addFakeTenant({ id: TENANT_JAVIER, name: 'Javier', slug: 'javier' });
    addFakeUser({
      id: USER_ADMIN,
      username: 'javier-admin',
      role: 'ADMIN',
      tenantId: TENANT_JAVIER,
    });

    const { status, body } = await api<DashboardData>('/api/v1/admin/dashboard', {}, adminToken);

    expect(status).toBe(200);
    expect(body.data).toEqual({
      totalGames: 0,
      availableGames: 0,
      unavailableGames: 0,
      libraryGames: 0,
      customGames: 0,
      mediaErrors: 0,
      orphanMedia: 0,
      activeSessions: 0,
      recentAuditEvents: 0,
      catalogVersion: null,
    });
  });
});
