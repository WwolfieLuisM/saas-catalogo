import { getPrisma } from '../../config/database.js';
import type { AuthContext } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import type { DashboardData, DashboardQuery } from './dashboard.schemas.js';

const RECENT_AUDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

interface DashboardScope {
  tenantId: string | null;
}

async function ensureTenantExists(tenantId: string): Promise<void> {
  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId } });

  if (!tenant) {
    throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
  }
}

function resolveScope(auth: AuthContext | null, query: DashboardQuery): DashboardScope {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  if (auth.role === 'ADMIN') {
    if (!auth.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Cuenta ADMIN sin tenant asignado');
    }
    if (query.tenantId && query.tenantId !== auth.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'No puedes operar sobre otro tenant');
    }
    return { tenantId: auth.tenantId };
  }

  if (auth.role === 'SUPER_ADMIN') {
    return { tenantId: query.tenantId ?? null };
  }

  throw new AppError(403, 'FORBIDDEN', 'Rol no autorizado');
}

export async function getDashboard(
  auth: AuthContext | null,
  query: DashboardQuery,
): Promise<DashboardData> {
  const scope = resolveScope(auth, query);

  if (scope.tenantId) {
    await ensureTenantExists(scope.tenantId);
  }

  const prisma = getPrisma();
  const tenantId = scope.tenantId;
  const gameScope = tenantId ? { tenantId } : {};
  const now = new Date();
  const auditSince = new Date(now.getTime() - RECENT_AUDIT_WINDOW_MS);

  let sessionAdminIds: string[] | undefined;

  if (tenantId) {
    const admins = await prisma.adminUser.findMany({
      where: { tenantId },
      select: { id: true },
    });
    sessionAdminIds = admins.map((admin) => admin.id);
  }

  const [
    totalGames,
    availableGames,
    unavailableGames,
    libraryGames,
    customGames,
    mediaErrors,
    orphanMedia,
    activeSessions,
    recentAuditEvents,
    catalog,
  ] = await Promise.all([
    prisma.tenantGame.count({ where: { ...gameScope, deletedAt: null } }),
    prisma.tenantGame.count({ where: { ...gameScope, deletedAt: null, availability: true } }),
    prisma.tenantGame.count({ where: { ...gameScope, deletedAt: null, availability: false } }),
    prisma.tenantGame.count({ where: { ...gameScope, deletedAt: null, origin: 'BIBLIOTECA' } }),
    prisma.tenantGame.count({ where: { ...gameScope, deletedAt: null, origin: 'PERSONALIZADO' } }),
    prisma.gameMedia.count({ where: { ...gameScope, status: 'ERROR' } }),
    prisma.gameMedia.count({ where: { ...gameScope, status: 'ORPHAN' } }),
    prisma.adminSession.count({
      where: {
        ...(sessionAdminIds ? { adminId: { in: sessionAdminIds } } : {}),
        revokedAt: null,
        expiresAt: { gte: now },
      },
    }),
    prisma.auditLog.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        timestamp: { gte: auditSince },
      },
    }),
    tenantId ? prisma.catalogMetadata.findUnique({ where: { tenantId } }) : Promise.resolve(null),
  ]);

  return {
    totalGames,
    availableGames,
    unavailableGames,
    libraryGames,
    customGames,
    mediaErrors,
    orphanMedia,
    activeSessions,
    recentAuditEvents,
    catalogVersion: catalog?.version ?? null,
  };
}
