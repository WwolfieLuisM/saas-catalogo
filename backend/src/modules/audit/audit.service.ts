import type { Prisma } from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';

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
