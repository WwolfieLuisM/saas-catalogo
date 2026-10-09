import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import type { FakeTaxonomy } from '../helpers/fakeDb.js';
import {
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
  error?: { code: string; message: string };
}

interface TaxonomyData {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
}

const RESOURCES = [
  {
    path: 'categories',
    entity: 'Category',
    notFoundCode: 'CATEGORY_NOT_FOUND',
    slugExistsCode: 'CATEGORY_SLUG_EXISTS',
  },
  {
    path: 'genres',
    entity: 'Genre',
    notFoundCode: 'GENRE_NOT_FOUND',
    slugExistsCode: 'GENRE_SLUG_EXISTS',
  },
  {
    path: 'platforms',
    entity: 'Platform',
    notFoundCode: 'PLATFORM_NOT_FOUND',
    slugExistsCode: 'PLATFORM_SLUG_EXISTS',
  },
] as const;

type ResourcePath = (typeof RESOURCES)[number]['path'];

const ADD: Record<ResourcePath, (input: Parameters<typeof addFakeCategory>[0]) => FakeTaxonomy> = {
  categories: addFakeCategory,
  genres: addFakeGenre,
  platforms: addFakePlatform,
};

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;

const T_JAVIER = '11111111-1111-4111-8111-111111111111';
const T_OTRO = '22222222-2222-4222-8222-222222222222';

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

describe.each(RESOURCES)('$path', ({ path, entity, notFoundCode, slugExistsCode }) => {
  const base = `/api/v1/admin/${path}`;

  function rows(): Map<string, FakeTaxonomy> {
    return state[path];
  }

  function seed(overrides: Partial<FakeTaxonomy> = {}): FakeTaxonomy {
    return ADD[path]({
      id: randomUUID(),
      tenantId: T_JAVIER,
      name: 'Accion',
      slug: randomUUID(),
      ...overrides,
    });
  }

  function auditRow(action: string) {
    return [...state.auditLogs.values()].find(
      (row) => row.action === action && row.entity === entity,
    );
  }

  describe('GET /', () => {
    it('devuelve 401 sin token', async () => {
      const { status, body } = await api(base);

      expect(status).toBe(401);
      expect(body.error?.code).toBe('UNAUTHENTICATED');
    });

    it('lista solo el tenant de la sesión ADMIN con meta', async () => {
      seed({ name: 'Propia', slug: 'propia' });
      seed({ tenantId: T_OTRO, name: 'Ajena', slug: 'ajena' });

      const { status, body } = await api<TaxonomyData[]>(base, {}, adminToken);

      expect(status).toBe(200);
      expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(body.data).toHaveLength(1);
      expect(body.data?.[0]).toMatchObject({ name: 'Propia', tenantId: T_JAVIER });
    });

    it('excluye registros eliminados', async () => {
      seed({ name: 'Activa', slug: 'activa' });
      seed({ name: 'Borrada', slug: 'borrada', deletedAt: new Date(), deletedBy: 'u-admin' });

      const { status, body } = await api<TaxonomyData[]>(base, {}, adminToken);

      expect(status).toBe(200);
      expect(body.meta?.total).toBe(1);
      expect(body.data?.[0]?.name).toBe('Activa');
    });

    it('exige tenantId para SUPER_ADMIN', async () => {
      const { status, body } = await api(base, {}, superToken);

      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('lista el tenant indicado para SUPER_ADMIN', async () => {
      seed({ tenantId: T_OTRO, name: 'Ajena', slug: 'ajena' });

      const { status, body } = await api<TaxonomyData[]>(
        `${base}?tenantId=${T_OTRO}`,
        {},
        superToken,
      );

      expect(status).toBe(200);
      expect(body.meta?.total).toBe(1);
      expect(body.data?.[0]?.tenantId).toBe(T_OTRO);
    });

    it('rechaza tenantId ajeno para ADMIN', async () => {
      const { status, body } = await api(`${base}?tenantId=${T_OTRO}`, {}, adminToken);

      expect(status).toBe(403);
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('acepta tenantId propio para ADMIN', async () => {
      seed({ name: 'Propia', slug: 'propia' });

      const { status, body } = await api(`${base}?tenantId=${T_JAVIER}`, {}, adminToken);

      expect(status).toBe(200);
      expect(body.meta?.total).toBe(1);
    });

    it('filtra q case-insensitive en name y slug', async () => {
      seed({ name: 'Aventura Extrema', slug: 'aventura-extrema' });
      seed({ name: 'Deportes', slug: 'deportes' });

      const byName = await api<TaxonomyData[]>(`${base}?q=AVENTURA`, {}, adminToken);
      expect(byName.body.meta?.total).toBe(1);
      expect(byName.body.data?.[0]?.slug).toBe('aventura-extrema');

      const bySlug = await api<TaxonomyData[]>(`${base}?q=DEPORTES`, {}, adminToken);
      expect(bySlug.body.meta?.total).toBe(1);
      expect(bySlug.body.data?.[0]?.name).toBe('Deportes');
    });

    it('pagina con page y limit', async () => {
      seed({ name: 'Uno', slug: 'uno' });
      seed({ name: 'Dos', slug: 'dos' });
      seed({ name: 'Tres', slug: 'tres' });

      const { status, body } = await api(`${base}?limit=2&page=2`, {}, adminToken);

      expect(status).toBe(200);
      expect(body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
      expect(body.data).toHaveLength(1);
    });

    it('ordena por sort name asc y desc', async () => {
      seed({ name: 'Zeta', slug: 'zeta' });
      seed({ name: 'Alfa', slug: 'alfa' });

      const asc = await api<TaxonomyData[]>(`${base}?sort=name`, {}, adminToken);
      expect(asc.body.data?.map((row) => row.name)).toEqual(['Alfa', 'Zeta']);

      const desc = await api<TaxonomyData[]>(`${base}?sort=-name`, {}, adminToken);
      expect(desc.body.data?.map((row) => row.name)).toEqual(['Zeta', 'Alfa']);
    });

    it('devuelve 400 con sort inválido', async () => {
      const { status, body } = await api(`${base}?sort=otro`, {}, adminToken);

      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /', () => {
    it('devuelve 401 sin token', async () => {
      const { status } = await api(base, {
        method: 'POST',
        body: JSON.stringify({ name: 'Nueva', slug: 'nueva' }),
      });

      expect(status).toBe(401);
    });

    it('ADMIN crea en su tenant sin enviar tenantId y audita', async () => {
      const { status, body } = await api<TaxonomyData>(
        base,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Nueva', slug: 'nueva', description: 'texto' }),
        },
        adminToken,
      );

      expect(status).toBe(201);
      expect(body.data).toMatchObject({
        tenantId: T_JAVIER,
        name: 'Nueva',
        slug: 'nueva',
        description: 'texto',
        createdBy: 'u-admin',
        updatedBy: 'u-admin',
        deletedAt: null,
      });

      const log = auditRow('CREATE');
      expect(log).toMatchObject({
        entity,
        entityId: body.data?.id,
        actorId: 'u-admin',
        actorRole: 'ADMIN',
        tenantId: T_JAVIER,
      });
      expect(log?.metadata).toMatchObject({ name: 'Nueva', slug: 'nueva' });
    });

    it('ADMIN acepta tenantId propio en el cuerpo', async () => {
      const { status, body } = await api<TaxonomyData>(
        base,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Nueva', slug: 'nueva', tenantId: T_JAVIER }),
        },
        adminToken,
      );

      expect(status).toBe(201);
      expect(body.data?.tenantId).toBe(T_JAVIER);
    });

    it('ADMIN recibe 403 con tenantId ajeno en el cuerpo', async () => {
      const { status, body } = await api(
        base,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Nueva', slug: 'nueva', tenantId: T_OTRO }),
        },
        adminToken,
      );

      expect(status).toBe(403);
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('exige tenantId para SUPER_ADMIN', async () => {
      const { status, body } = await api(
        base,
        { method: 'POST', body: JSON.stringify({ name: 'Nueva', slug: 'nueva' }) },
        superToken,
      );

      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('SUPER_ADMIN crea en el tenant indicado', async () => {
      const { status, body } = await api<TaxonomyData>(
        base,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Ajena', slug: 'ajena', tenantId: T_OTRO }),
        },
        superToken,
      );

      expect(status).toBe(201);
      expect(body.data).toMatchObject({ tenantId: T_OTRO, createdBy: 'u-super' });
    });

    it('devuelve 409 si el slug ya existe en el mismo tenant', async () => {
      seed({ slug: 'ocupado' });

      const { status, body } = await api(
        base,
        { method: 'POST', body: JSON.stringify({ name: 'Duplicada', slug: 'ocupado' }) },
        adminToken,
      );

      expect(status).toBe(409);
      expect(body.error?.code).toBe(slugExistsCode);
    });

    it('permite el mismo slug en otro tenant', async () => {
      seed({ tenantId: T_OTRO, slug: 'repetido' });

      const { status, body } = await api<TaxonomyData>(
        base,
        { method: 'POST', body: JSON.stringify({ name: 'Propia', slug: 'repetido' }) },
        adminToken,
      );

      expect(status).toBe(201);
      expect(body.data?.tenantId).toBe(T_JAVIER);
    });

    it('devuelve 400 con slug inválido', async () => {
      const { status, body } = await api(
        base,
        { method: 'POST', body: JSON.stringify({ name: 'Mala', slug: 'Slug Invalido' }) },
        adminToken,
      );

      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('devuelve 400 sin name', async () => {
      const { status } = await api(
        base,
        { method: 'POST', body: JSON.stringify({ slug: 'sin-nombre' }) },
        adminToken,
      );

      expect(status).toBe(400);
    });
  });

  describe('GET /:id', () => {
    it('devuelve el recurso por id', async () => {
      const row = seed({ name: 'Unica', slug: 'unica' });

      const { status, body } = await api<TaxonomyData>(`${base}/${row.id}`, {}, adminToken);

      expect(status).toBe(200);
      expect(body.data).toMatchObject({ id: row.id, name: 'Unica', slug: 'unica' });
    });

    it('devuelve 404 si no existe', async () => {
      const { status, body } = await api(`${base}/${randomUUID()}`, {}, adminToken);

      expect(status).toBe(404);
      expect(body.error?.code).toBe(notFoundCode);
    });

    it('devuelve 400 si el id no es uuid', async () => {
      const { status } = await api(`${base}/no-es-uuid`, {}, adminToken);

      expect(status).toBe(400);
    });

    it('ADMIN no ve recursos de otro tenant (404)', async () => {
      const row = seed({ tenantId: T_OTRO });

      const { status, body } = await api(`${base}/${row.id}`, {}, adminToken);

      expect(status).toBe(404);
      expect(body.error?.code).toBe(notFoundCode);
    });

    it('devuelve 404 si está eliminado', async () => {
      const row = seed({ deletedAt: new Date() });

      const { status } = await api(`${base}/${row.id}`, {}, adminToken);

      expect(status).toBe(404);
    });
  });

  describe('PATCH /:id', () => {
    it('actualiza name, slug y description y audita', async () => {
      const row = seed({ name: 'Vieja', slug: 'vieja' });

      const { status, body } = await api<TaxonomyData>(
        `${base}/${row.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Nueva', slug: 'nuevo-slug', description: 'ok' }),
        },
        adminToken,
      );

      expect(status).toBe(200);
      expect(body.data).toMatchObject({
        name: 'Nueva',
        slug: 'nuevo-slug',
        description: 'ok',
        updatedBy: 'u-admin',
      });
      expect(rows().get(row.id)?.name).toBe('Nueva');

      const log = auditRow('UPDATE');
      expect(log).toMatchObject({ entity, entityId: row.id, actorId: 'u-admin' });
      expect(log?.metadata).toMatchObject({ fields: ['name', 'slug', 'description'] });
    });

    it('devuelve 400 sin campos', async () => {
      const row = seed();

      const { status } = await api(
        `${base}/${row.id}`,
        { method: 'PATCH', body: JSON.stringify({}) },
        adminToken,
      );

      expect(status).toBe(400);
    });

    it('devuelve 409 si el slug ya lo usa otro registro', async () => {
      seed({ slug: 'ocupado' });
      const row = seed({ name: 'Otra', slug: 'otra' });

      const { status, body } = await api(
        `${base}/${row.id}`,
        { method: 'PATCH', body: JSON.stringify({ slug: 'ocupado' }) },
        adminToken,
      );

      expect(status).toBe(409);
      expect(body.error?.code).toBe(slugExistsCode);
    });

    it('devuelve 404 si no existe', async () => {
      const { status } = await api(
        `${base}/${randomUUID()}`,
        { method: 'PATCH', body: JSON.stringify({ name: 'Nuevo' }) },
        adminToken,
      );

      expect(status).toBe(404);
    });

    it('ADMIN no modifica recursos de otro tenant (404)', async () => {
      const row = seed({ tenantId: T_OTRO, name: 'Ajena' });

      const { status, body } = await api(
        `${base}/${row.id}`,
        { method: 'PATCH', body: JSON.stringify({ name: 'Hackeada' }) },
        adminToken,
      );

      expect(status).toBe(404);
      expect(body.error?.code).toBe(notFoundCode);
      expect(rows().get(row.id)?.name).toBe('Ajena');
    });
  });

  describe('DELETE /:id', () => {
    it('elimina con soft delete, excluye de listas y audita', async () => {
      const row = seed({ name: 'Borrar', slug: 'borrar' });

      const { status, body } = await api<TaxonomyData>(
        `${base}/${row.id}`,
        { method: 'DELETE' },
        adminToken,
      );

      expect(status).toBe(200);
      expect(body.data?.deletedAt).toBeTruthy();
      expect(body.data?.deletedBy).toBe('u-admin');
      expect(rows().get(row.id)?.deletedBy).toBe('u-admin');

      const list = await api(`${base}`, {}, adminToken);
      expect(list.body.meta?.total).toBe(0);

      const get = await api(`${base}/${row.id}`, {}, adminToken);
      expect(get.status).toBe(404);

      const log = auditRow('DELETE');
      expect(log).toMatchObject({ entity, entityId: row.id, actorId: 'u-admin' });
      expect(log?.metadata).toMatchObject({ name: 'Borrar', slug: 'borrar' });
    });

    it('devuelve 404 si ya está eliminado', async () => {
      const row = seed({ deletedAt: new Date() });

      const { status } = await api(`${base}/${row.id}`, { method: 'DELETE' }, adminToken);

      expect(status).toBe(404);
    });

    it('devuelve 404 si no existe', async () => {
      const { status } = await api(`${base}/${randomUUID()}`, { method: 'DELETE' }, adminToken);

      expect(status).toBe(404);
    });

    it('ADMIN no elimina recursos de otro tenant (404)', async () => {
      const row = seed({ tenantId: T_OTRO });

      const { status } = await api(`${base}/${row.id}`, { method: 'DELETE' }, adminToken);

      expect(status).toBe(404);
      expect(rows().get(row.id)?.deletedAt).toBeNull();
    });
  });

  describe('POST /:id/restore', () => {
    it('restaura un registro eliminado y audita', async () => {
      const row = seed({ deletedAt: new Date(), deletedBy: 'u-admin' });

      const { status, body } = await api<TaxonomyData>(
        `${base}/${row.id}/restore`,
        { method: 'POST' },
        adminToken,
      );

      expect(status).toBe(200);
      expect(body.data?.deletedAt).toBeNull();
      expect(body.data?.deletedBy).toBeNull();
      expect(rows().get(row.id)?.deletedAt).toBeNull();

      const log = auditRow('RESTORE');
      expect(log).toMatchObject({ entity, entityId: row.id, actorId: 'u-admin' });
    });

    it('devuelve 409 si no está eliminado', async () => {
      const row = seed();

      const { status, body } = await api(
        `${base}/${row.id}/restore`,
        { method: 'POST' },
        adminToken,
      );

      expect(status).toBe(409);
      expect(body.error?.code).toBe('NOT_DELETED');
    });

    it('devuelve 404 si no existe', async () => {
      const { status } = await api(
        `${base}/${randomUUID()}/restore`,
        { method: 'POST' },
        adminToken,
      );

      expect(status).toBe(404);
    });

    it('ADMIN no restaura recursos de otro tenant (404)', async () => {
      const row = seed({ tenantId: T_OTRO, deletedAt: new Date() });

      const { status } = await api(`${base}/${row.id}/restore`, { method: 'POST' }, adminToken);

      expect(status).toBe(404);
      expect(rows().get(row.id)?.deletedAt).not.toBeNull();
    });
  });
});

describe('tenant inexistente (SUPER_ADMIN)', () => {
  const MISSING_TENANT = '99999999-9999-4999-8999-999999999999';

  it.each(['categories', 'genres', 'platforms'])(
    'GET /%s con tenantId inexistente devuelve 422 TENANT_NOT_FOUND',
    async (path) => {
      const { status, body } = await api(
        `/api/v1/admin/${path}?tenantId=${MISSING_TENANT}`,
        {},
        superToken,
      );

      expect(status).toBe(422);
      expect(body.error?.code).toBe('TENANT_NOT_FOUND');
    },
  );

  it('POST /categories con tenantId inexistente devuelve 422 TENANT_NOT_FOUND', async () => {
    const { status, body } = await api(
      '/api/v1/admin/categories',
      {
        method: 'POST',
        body: JSON.stringify({ tenantId: MISSING_TENANT, name: 'Xx', slug: 'x-missing' }),
      },
      superToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('TENANT_NOT_FOUND');
  });
});
