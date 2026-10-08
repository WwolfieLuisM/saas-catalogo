import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import type { Prisma, Tenant } from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';
import { auditData } from '../audit/audit.service.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import type { CreateTenantInput, TenantListQuery, UpdateTenantInput } from './tenants.schemas.js';

export function tenantDto(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    isActive: tenant.isActive,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export async function listTenants(
  query: TenantListQuery,
): Promise<{ items: Tenant[]; total: number }> {
  const prisma = getPrisma();

  const where: Prisma.TenantWhereInput = {
    AND: [
      query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {},
      query.isActive !== undefined ? { isActive: query.isActive } : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.tenant.count({ where }),
  ]);

  return { items, total };
}

export async function getTenant(id: string): Promise<Tenant> {
  const tenant = await getPrisma().tenant.findUnique({ where: { id } });

  if (!tenant) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant no encontrado');
  }

  return tenant;
}

export async function createTenant(
  input: CreateTenantInput,
  actor: AuthContext | null,
  meta: RequestMeta,
): Promise<Tenant> {
  const prisma = getPrisma();
  const existing = await prisma.tenant.findUnique({ where: { slug: input.slug } });

  if (existing) {
    throw new AppError(409, 'TENANT_SLUG_EXISTS', 'Ya existe un tenant con ese slug');
  }

  const tenantId = randomUUID();

  const [tenant] = await prisma.$transaction([
    prisma.tenant.create({
      data: { id: tenantId, name: input.name, slug: input.slug },
    }),
    prisma.tenantSettings.create({ data: { tenantId } }),
    prisma.auditLog.create({
      data: auditData({
        actor,
        action: 'CREATE',
        entity: 'Tenant',
        entityId: tenantId,
        tenantId,
        metadata: { name: input.name, slug: input.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ]);

  return tenant as Tenant;
}

export async function updateTenant(
  id: string,
  input: UpdateTenantInput,
  actor: AuthContext | null,
  meta: RequestMeta,
): Promise<Tenant> {
  const prisma = getPrisma();
  await getTenant(id);

  const [tenant] = await prisma.$transaction([
    prisma.tenant.update({ where: { id }, data: input }),
    prisma.auditLog.create({
      data: auditData({
        actor,
        action: 'UPDATE',
        entity: 'Tenant',
        entityId: id,
        tenantId: id,
        metadata: { fields: Object.keys(input) },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ]);

  return tenant as Tenant;
}
