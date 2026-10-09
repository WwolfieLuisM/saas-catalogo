import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import type { AuthContext } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import { planCatalogBump } from '../catalog/catalog.service.js';
import type { TaxonomyConfig } from './taxonomy.config.js';
import type {
  CreateTaxonomyInput,
  TaxonomyListQuery,
  UpdateTaxonomyInput,
} from './taxonomy.schemas.js';

export interface TaxonomyRow {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TaxonomyWhere {
  AND?: TaxonomyWhere[];
  OR?: TaxonomyWhere[];
  id?: string;
  tenantId?: string;
  slug?: string | { contains: string; mode: 'insensitive' };
  deletedAt?: Date | null;
  name?: { contains: string; mode: 'insensitive' };
}

interface TaxonomyFindManyArgs {
  where?: TaxonomyWhere;
  orderBy?: Record<string, 'asc' | 'desc'>;
  skip?: number;
  take?: number;
}

interface TaxonomyCreateData {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  createdBy: string | null;
  updatedBy: string | null;
}

interface TaxonomyUpdateData {
  name?: string;
  slug?: string;
  description?: string | null;
  updatedBy?: string | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

interface TaxonomyDelegate {
  findMany(args: TaxonomyFindManyArgs): Promise<TaxonomyRow[]>;
  count(args: { where?: TaxonomyWhere }): Promise<number>;
  findFirst(args: { where: TaxonomyWhere }): Promise<TaxonomyRow | null>;
  create(args: { data: TaxonomyCreateData }): Promise<TaxonomyRow>;
  update(args: { where: { id: string }; data: TaxonomyUpdateData }): Promise<TaxonomyRow>;
}

type TaxonomyDb = {
  $transaction<T>(ops: Promise<T>[]): Promise<T[]>;
  auditLog: { create(args: { data: ReturnType<typeof auditData> }): Promise<unknown> };
} & Record<string, unknown>;

export function taxonomyDto(row: TaxonomyRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedBy: row.deletedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveTenantId(
  auth: AuthContext | null,
  requested: string | undefined,
): Promise<string> {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  if (auth.role === 'ADMIN') {
    if (!auth.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Cuenta ADMIN sin tenant asignado');
    }
    if (requested && requested !== auth.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'No puedes operar sobre otro tenant');
    }
    return auth.tenantId;
  }

  if (auth.role === 'SUPER_ADMIN') {
    if (!requested) {
      throw new AppError(400, 'VALIDATION_ERROR', 'tenantId es obligatorio para SUPER_ADMIN');
    }
    const tenant = await getPrisma().tenant.findUnique({ where: { id: requested } });

    if (!tenant) {
      throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
    }
    return requested;
  }

  throw new AppError(403, 'FORBIDDEN', 'Rol no autorizado');
}

function assertRowAccess(row: TaxonomyRow, auth: AuthContext | null, notFoundCode: string): void {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  if (auth.role === 'ADMIN' && row.tenantId !== auth.tenantId) {
    throw new AppError(404, notFoundCode, 'Recurso no encontrado');
  }
}

function orderByFromSort(sort: string): Record<string, 'asc' | 'desc'> {
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  return { [field]: direction };
}

export function createTaxonomyService(config: TaxonomyConfig) {
  function getDb(): { db: TaxonomyDb; delegate: TaxonomyDelegate } {
    const db = getPrisma() as unknown as TaxonomyDb;
    return { db, delegate: db[config.delegate] as TaxonomyDelegate };
  }

  async function findRow(id: string, includeDeleted: boolean): Promise<TaxonomyRow> {
    const { delegate } = getDb();
    const row = await delegate.findFirst({
      where: includeDeleted ? { id } : { id, deletedAt: null },
    });

    if (!row) {
      throw new AppError(404, config.notFoundCode, 'Recurso no encontrado');
    }

    return row;
  }

  async function list(
    query: TaxonomyListQuery,
    auth: AuthContext | null,
  ): Promise<{ items: TaxonomyRow[]; total: number }> {
    const tenantId = await resolveTenantId(auth, query.tenantId);
    const { delegate } = getDb();

    const where: TaxonomyWhere = {
      AND: [
        { tenantId },
        { deletedAt: null },
        query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { slug: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        orderBy: orderByFromSort(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      delegate.count({ where }),
    ]);

    return { items, total };
  }

  async function get(id: string, auth: AuthContext | null): Promise<TaxonomyRow> {
    const row = await findRow(id, false);
    assertRowAccess(row, auth, config.notFoundCode);
    return row;
  }

  async function create(
    input: CreateTaxonomyInput,
    auth: AuthContext | null,
    meta: RequestMeta,
  ): Promise<TaxonomyRow> {
    const tenantId = await resolveTenantId(auth, input.tenantId);
    const { db, delegate } = getDb();

    const existing = await delegate.findFirst({ where: { tenantId, slug: input.slug } });
    if (existing) {
      throw new AppError(409, config.slugExistsCode, 'Ya existe un registro con ese slug');
    }

    const id = randomUUID();
    const ops: Promise<unknown>[] = [
      delegate.create({
        data: {
          id,
          tenantId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          createdBy: auth?.id ?? null,
          updatedBy: auth?.id ?? null,
        },
      }),
      db.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'CREATE',
          entity: config.entity,
          entityId: id,
          tenantId,
          metadata: { name: input.name, slug: input.slug },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    ];

    if (tenantId) {
      ops.push((await planCatalogBump(tenantId)).op);
    }

    const [row] = await db.$transaction(ops);

    return row as TaxonomyRow;
  }

  async function update(
    id: string,
    input: UpdateTaxonomyInput,
    auth: AuthContext | null,
    meta: RequestMeta,
  ): Promise<TaxonomyRow> {
    const row = await findRow(id, false);
    assertRowAccess(row, auth, config.notFoundCode);
    const { db, delegate } = getDb();

    if (input.slug !== undefined && input.slug !== row.slug) {
      const existing = await delegate.findFirst({
        where: { tenantId: row.tenantId, slug: input.slug },
      });
      if (existing) {
        throw new AppError(409, config.slugExistsCode, 'Ya existe un registro con ese slug');
      }
    }

    const nameOrSlugChanged =
      (input.name !== undefined && input.name !== row.name) ||
      (input.slug !== undefined && input.slug !== row.slug);

    const ops: Promise<unknown>[] = [
      delegate.update({
        where: { id: row.id },
        data: { ...input, updatedBy: auth?.id ?? null },
      }),
      db.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'UPDATE',
          entity: config.entity,
          entityId: row.id,
          tenantId: row.tenantId,
          metadata: { fields: Object.keys(input) },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    ];

    if (row.tenantId && nameOrSlugChanged) {
      ops.push((await planCatalogBump(row.tenantId)).op);
    }

    const [updated] = await db.$transaction(ops);

    return updated as TaxonomyRow;
  }

  async function remove(
    id: string,
    auth: AuthContext | null,
    meta: RequestMeta,
  ): Promise<TaxonomyRow> {
    const row = await findRow(id, false);
    assertRowAccess(row, auth, config.notFoundCode);

    const { db, delegate } = getDb();
    const ops: Promise<unknown>[] = [
      delegate.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), deletedBy: auth?.id ?? null, updatedBy: auth?.id ?? null },
      }),
      db.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'DELETE',
          entity: config.entity,
          entityId: row.id,
          tenantId: row.tenantId,
          metadata: { name: row.name, slug: row.slug },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    ];

    if (row.tenantId) {
      ops.push((await planCatalogBump(row.tenantId)).op);
    }

    const [deleted] = await db.$transaction(ops);

    return deleted as TaxonomyRow;
  }

  async function restore(
    id: string,
    auth: AuthContext | null,
    meta: RequestMeta,
  ): Promise<TaxonomyRow> {
    const row = await findRow(id, true);
    assertRowAccess(row, auth, config.notFoundCode);

    if (!row.deletedAt) {
      throw new AppError(409, 'NOT_DELETED', 'El registro no está eliminado');
    }

    const { db, delegate } = getDb();
    const ops: Promise<unknown>[] = [
      delegate.update({
        where: { id: row.id },
        data: { deletedAt: null, deletedBy: null, updatedBy: auth?.id ?? null },
      }),
      db.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'RESTORE',
          entity: config.entity,
          entityId: row.id,
          tenantId: row.tenantId,
          metadata: { name: row.name, slug: row.slug },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    ];

    if (row.tenantId) {
      ops.push((await planCatalogBump(row.tenantId)).op);
    }

    const [restored] = await db.$transaction(ops);

    return restored as TaxonomyRow;
  }

  return { list, get, create, update, remove, restore };
}

export type TaxonomyService = ReturnType<typeof createTaxonomyService>;
