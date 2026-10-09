import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { getPrisma } from '../../config/database.js';
import type { AdminUser, Prisma } from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import type {
  AdministratorListQuery,
  CreateAdministratorInput,
  UpdateAdministratorInput,
} from './administrators.schemas.js';

export function administratorDto(admin: AdminUser) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    tenantId: admin.tenantId,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

async function ensureTenantExists(tenantId: string | null | undefined): Promise<void> {
  if (!tenantId) {
    return;
  }

  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId } });

  if (!tenant) {
    throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
  }
}

export async function listAdministrators(
  query: AdministratorListQuery,
): Promise<{ items: AdminUser[]; total: number }> {
  const prisma = getPrisma();

  const where: Prisma.AdminUserWhereInput = {
    AND: [
      query.q ? { username: { contains: query.q, mode: 'insensitive' } } : {},
      query.tenantId ? { tenantId: query.tenantId } : {},
      query.role ? { role: query.role } : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.adminUser.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.adminUser.count({ where }),
  ]);

  return { items, total };
}

export async function getAdministrator(id: string): Promise<AdminUser> {
  const admin = await getPrisma().adminUser.findUnique({ where: { id } });

  if (!admin) {
    throw new AppError(404, 'ADMINISTRATOR_NOT_FOUND', 'Administrador no encontrado');
  }

  return admin;
}

export async function createAdministrator(
  input: CreateAdministratorInput,
  actor: AuthContext | null,
  meta: RequestMeta,
): Promise<AdminUser> {
  const prisma = getPrisma();
  const existing = await prisma.adminUser.findUnique({ where: { username: input.username } });

  if (existing) {
    throw new AppError(409, 'USERNAME_TAKEN', 'Ese username ya está en uso');
  }

  await ensureTenantExists(input.tenantId);

  const adminId = randomUUID();
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const tenantId = input.role === 'SUPER_ADMIN' ? null : (input.tenantId ?? null);

  const [created] = await prisma.$transaction([
    prisma.adminUser.create({
      data: {
        id: adminId,
        username: input.username,
        passwordHash,
        role: input.role,
        tenantId,
        isActive: true,
      },
    }),
    prisma.auditLog.create({
      data: auditData({
        actor,
        action: 'CREATE',
        entity: 'AdminUser',
        entityId: adminId,
        tenantId,
        metadata: { username: input.username, role: input.role },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ]);

  return created;
}

export async function updateAdministrator(
  id: string,
  patch: UpdateAdministratorInput,
  actor: AuthContext | null,
  meta: RequestMeta,
): Promise<AdminUser> {
  const prisma = getPrisma();
  const target = await getAdministrator(id);

  const nextRole = patch.role ?? target.role;

  if (nextRole === 'SUPER_ADMIN' && patch.tenantId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'role SUPER_ADMIN no admite tenantId');
  }

  const nextTenantId =
    nextRole === 'SUPER_ADMIN'
      ? null
      : patch.tenantId !== undefined
        ? patch.tenantId
        : target.tenantId;

  if (nextRole === 'ADMIN' && !nextTenantId) {
    throw new AppError(422, 'ROLE_TENANT_REQUIRED', 'role ADMIN requiere un tenantId');
  }

  await ensureTenantExists(nextTenantId);

  const demoting = target.role === 'SUPER_ADMIN' && nextRole === 'ADMIN';
  const deactivating = target.isActive && patch.isActive === false;

  if (demoting || deactivating) {
    const remaining = await prisma.adminUser.count({
      where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } },
    });

    if (remaining === 0) {
      throw new AppError(
        409,
        'LAST_SUPER_ADMIN',
        'No se puede dar de baja al último SUPER_ADMIN activo',
      );
    }
  }

  if (patch.username !== undefined && patch.username !== target.username) {
    const taken = await prisma.adminUser.findUnique({ where: { username: patch.username } });

    if (taken) {
      throw new AppError(409, 'USERNAME_TAKEN', 'Ese username ya está en uso');
    }
  }

  const data: Prisma.AdminUserUncheckedUpdateInput = {
    ...(patch.username !== undefined ? { username: patch.username } : {}),
    ...(patch.password !== undefined
      ? { passwordHash: await argon2.hash(patch.password, { type: argon2.argon2id }) }
      : {}),
    role: nextRole,
    tenantId: nextTenantId,
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
  };

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.adminUser.update({ where: { id }, data }),
    prisma.auditLog.create({
      data: auditData({
        actor,
        action: 'UPDATE',
        entity: 'AdminUser',
        entityId: id,
        tenantId: nextTenantId,
        metadata: { fields: Object.keys(patch) },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ];

  if (patch.password !== undefined) {
    ops.push(
      prisma.adminSession.updateMany({
        where: { adminId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  const results = await prisma.$transaction(ops);
  const updated = results[0] as AdminUser;

  return updated;
}

export async function revokeSessions(
  id: string,
  actor: AuthContext | null,
  meta: RequestMeta,
): Promise<number> {
  const prisma = getPrisma();
  const target = await getAdministrator(id);

  const [result] = await prisma.$transaction([
    prisma.adminSession.updateMany({
      where: { adminId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: auditData({
        actor,
        action: 'REVOKE_SESSIONS',
        entity: 'AdminUser',
        entityId: id,
        tenantId: target.tenantId,
        metadata: {},
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ]);

  return result.count;
}
