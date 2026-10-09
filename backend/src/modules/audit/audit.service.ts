import { getPrisma } from '../../config/database.js';
import type { AuditLog, Prisma } from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import type { AuditListQuery } from './audit.schemas.js';

export interface AuditInput {
  actor: AuthContext | null;
  action: string;
  entity: string;
  entityId?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function auditData(input: AuditInput): Prisma.AuditLogCreateInput {
  return {
    actorId: input.actor?.id ?? null,
    actorRole: input.actor?.role ?? null,
    tenantId: input.tenantId ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  };
}

export interface AuditLogView {
  id: string;
  timestamp: Date;
  actorId: string | null;
  actorUsername: string | null;
  actorRole: AuditLog['actorRole'];
  tenantId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: AuditLog['metadata'];
  ipAddress: string | null;
}

export function auditLogDto(row: AuditLog, actorUsername: string | null): AuditLogView {
  return {
    id: row.id,
    timestamp: row.timestamp,
    actorId: row.actorId,
    actorUsername,
    actorRole: row.actorRole,
    tenantId: row.tenantId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    metadata: row.metadata,
    ipAddress: row.ipAddress,
  };
}

export async function listAuditLogs(
  auth: AuthContext | null,
  query: AuditListQuery,
): Promise<{ items: AuditLog[]; total: number; actorUsernames: Map<string, string> }> {
  const prisma = getPrisma();

  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  let scopedTenantId: string | undefined;

  if (auth.role === 'ADMIN') {
    if (!auth.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Cuenta ADMIN sin tenant asignado');
    }
    if (query.tenantId && query.tenantId !== auth.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'No puedes operar sobre otro tenant');
    }
    scopedTenantId = auth.tenantId;
  } else if (auth.role === 'SUPER_ADMIN') {
    if (query.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: query.tenantId } });

      if (!tenant) {
        throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
      }

      scopedTenantId = query.tenantId;
    }
  } else {
    throw new AppError(403, 'FORBIDDEN', 'Rol no autorizado');
  }

  const timestamp: Prisma.DateTimeFilter = {};

  if (query.from) {
    timestamp.gte = new Date(query.from);
  }
  if (query.to) {
    timestamp.lte = new Date(query.to);
  }

  let queryActorIds: string[] = [];

  if (query.q) {
    const actors = await prisma.adminUser.findMany({
      where: { username: { contains: query.q, mode: 'insensitive' } },
      select: { id: true },
    });
    queryActorIds = actors.map((admin) => admin.id);
  }

  const where: Prisma.AuditLogWhereInput = {
    AND: [
      scopedTenantId ? { tenantId: scopedTenantId } : {},
      query.action ? { action: query.action } : {},
      query.entity ? { entity: query.entity } : {},
      Object.keys(timestamp).length > 0 ? { timestamp } : {},
      query.q
        ? {
            OR: [
              { action: { contains: query.q, mode: 'insensitive' } },
              { entity: { contains: query.q, mode: 'insensitive' } },
              { entityId: { contains: query.q, mode: 'insensitive' } },
              { actorId: { in: queryActorIds } },
            ],
          }
        : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pageActorIds = [
    ...new Set(
      items.map((row) => row.actorId).filter((actorId): actorId is string => actorId !== null),
    ),
  ];

  const pageActors = pageActorIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: pageActorIds } } })
    : [];

  return {
    items,
    total,
    actorUsernames: new Map(pageActors.map((admin) => [admin.id, admin.username])),
  };
}
