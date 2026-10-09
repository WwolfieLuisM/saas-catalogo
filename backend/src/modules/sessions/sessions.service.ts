import { getPrisma } from '../../config/database.js';
import type { AdminSession, AdminUser, Prisma } from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import type { SessionListQuery } from './sessions.schemas.js';

export interface SessionView {
  id: string;
  adminId: string;
  adminUsername: string | null;
  adminRole: AdminUser['role'] | null;
  tenantId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  isCurrent: boolean;
}

export function sessionDto(
  row: AdminSession,
  admin: AdminUser | null,
  isCurrent: boolean,
): SessionView {
  return {
    id: row.id,
    adminId: row.adminId,
    adminUsername: admin?.username ?? null,
    adminRole: admin?.role ?? null,
    tenantId: admin?.tenantId ?? null,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    isCurrent,
  };
}

async function resolveAdminScope(
  auth: AuthContext | null,
  query: SessionListQuery,
): Promise<{ adminIds: string[] | undefined }> {
  const prisma = getPrisma();

  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  if (auth.role === 'ADMIN') {
    if (query.tenantId && query.tenantId !== auth.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'No puedes operar sobre otro tenant');
    }
    return { adminIds: [auth.id] };
  }

  if (auth.role === 'SUPER_ADMIN') {
    if (query.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: query.tenantId } });

      if (!tenant) {
        throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
      }

      const admins = await prisma.adminUser.findMany({
        where: { tenantId: query.tenantId },
        select: { id: true },
      });
      return { adminIds: admins.map((admin) => admin.id) };
    }

    return { adminIds: undefined };
  }

  throw new AppError(403, 'FORBIDDEN', 'Rol no autorizado');
}

async function findCurrentSessionId(adminId: string, now: Date): Promise<string | null> {
  const row = await getPrisma().adminSession.findFirst({
    where: { adminId, revokedAt: null, expiresAt: { gte: now } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  return row?.id ?? null;
}

async function loadAdmins(rows: AdminSession[]): Promise<Map<string, AdminUser>> {
  const prisma = getPrisma();
  const adminIds = [...new Set(rows.map((row) => row.adminId))];

  if (adminIds.length === 0) {
    return new Map();
  }

  const admins = await prisma.adminUser.findMany({ where: { id: { in: adminIds } } });
  return new Map(admins.map((admin) => [admin.id, admin]));
}

export async function listSessions(
  auth: AuthContext | null,
  query: SessionListQuery,
): Promise<{ items: SessionView[]; total: number }> {
  const prisma = getPrisma();
  const { adminIds } = await resolveAdminScope(auth, query);
  const now = new Date();

  const where: Prisma.AdminSessionWhereInput = {
    AND: [
      adminIds ? { adminId: { in: adminIds } } : {},
      query.status === 'active' ? { revokedAt: null, expiresAt: { gte: now } } : {},
      query.status === 'revoked' ? { revokedAt: { not: null } } : {},
      query.q ? { userAgent: { contains: query.q, mode: 'insensitive' } } : {},
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.adminSession.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.adminSession.count({ where }),
  ]);

  const [admins, currentSessionId] = await Promise.all([
    loadAdmins(rows),
    auth ? findCurrentSessionId(auth.id, now) : Promise.resolve(null),
  ]);

  return {
    items: rows.map((row) =>
      sessionDto(row, admins.get(row.adminId) ?? null, row.id === currentSessionId),
    ),
    total,
  };
}

export async function revokeSession(
  id: string,
  auth: AuthContext | null,
  meta: RequestMeta,
): Promise<SessionView> {
  const prisma = getPrisma();

  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  const session = await prisma.adminSession.findUnique({ where: { id } });

  if (!session || (auth.role === 'ADMIN' && session.adminId !== auth.id)) {
    throw new AppError(404, 'SESSION_NOT_FOUND', 'Sesión no encontrada');
  }

  if (session.revokedAt) {
    throw new AppError(409, 'SESSION_ALREADY_REVOKED', 'La sesión ya está revocada');
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: session.adminId } });
  const isCurrent = (await findCurrentSessionId(session.adminId, new Date())) === session.id;
  const revokedAt = new Date();

  await prisma.$transaction([
    prisma.adminSession.update({ where: { id }, data: { revokedAt } }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'SESSION_REVOKED',
        entity: 'AdminSession',
        entityId: id,
        tenantId: admin?.tenantId ?? null,
        metadata: { adminId: session.adminId },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ]);

  return sessionDto({ ...session, revokedAt }, admin, isCurrent);
}
