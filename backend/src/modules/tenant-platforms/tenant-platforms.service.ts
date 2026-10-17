import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import type { AuthContext } from '../../middleware/auth.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { AppError } from '../../utils/appError.js';
import { auditData } from '../audit/audit.service.js';
import { resolveTenantId } from '../games/games.service.js';
import type {
  CreateGlobalPlatformInput,
  SetPlatformEnabledInput,
  TenantPlatformsListQuery,
} from './tenant-platforms.schemas.js';

export interface TenantPlatformView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  enabled: boolean;
}

export async function listGlobalPlatforms(
  auth: AuthContext | null,
  query: TenantPlatformsListQuery,
): Promise<TenantPlatformView[]> {
  const tenantId = await resolveTenantId(auth, query.tenantId);
  const prisma = getPrisma();

  const platforms = await prisma.platform.findMany({
    where: { tenantId: null, deletedAt: null },
    orderBy: [{ name: 'asc' }],
  });
  const ids = platforms.map((platform) => platform.id);
  const enabled = ids.length
    ? await prisma.tenantPlatform.findMany({ where: { tenantId, platformId: { in: ids } } })
    : [];
  const enabledByPlatform = new Map(enabled.map((row) => [row.platformId, row.enabled]));

  return platforms.map((platform) => ({
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    description: platform.description,
    enabled: enabledByPlatform.get(platform.id) ?? false,
  }));
}

export async function setPlatformEnabled(
  auth: AuthContext | null,
  platformId: string,
  input: SetPlatformEnabledInput,
  meta: RequestMeta,
  query: TenantPlatformsListQuery,
): Promise<TenantPlatformView> {
  const tenantId = await resolveTenantId(auth, query.tenantId);
  if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');

  const prisma = getPrisma();
  const platform = await prisma.platform.findFirst({ where: { id: platformId } });

  if (!platform || platform.deletedAt) {
    throw new AppError(404, 'PLATFORM_NOT_FOUND', 'La plataforma no existe');
  }
  if (platform.tenantId !== null) {
    throw new AppError(
      422,
      'PLATFORM_NOT_GLOBAL',
      'Solo se pueden habilitar plataformas globales definidas por la plataforma de Luismi',
    );
  }

  await prisma.$transaction([
    prisma.tenantPlatform.upsert({
      where: { tenantId_platformId: { tenantId, platformId } },
      update: { enabled: input.enabled },
      create: { tenantId, platformId, enabled: input.enabled },
    }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'UPDATE',
        entity: 'TenantPlatform',
        entityId: platformId,
        tenantId,
        metadata: { platformSlug: platform.slug, enabled: input.enabled },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ]);

  return {
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    description: platform.description,
    enabled: input.enabled,
  };
}

export async function createGlobalPlatform(
  auth: AuthContext | null,
  input: CreateGlobalPlatformInput,
  meta: RequestMeta,
): Promise<{ id: string; name: string; slug: string; description: string | null; enabled: boolean }> {
  if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  if (auth.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Solo un administrador general crea plataformas globales');
  }

  const prisma = getPrisma();
  const existente = await prisma.platform.findFirst({ where: { tenantId: null, slug: input.slug } });

  if (existente && !existente.deletedAt) {
    throw new AppError(409, 'PLATFORM_SLUG_EXISTS', 'Ya existe un registro con ese slug');
  }

  const description = input.description ?? null;
  const nuevoId = randomUUID();

  const [platform] = await prisma.$transaction([
    existente
      ? prisma.platform.update({
          where: { id: existente.id },
          data: { name: input.name, description, deletedAt: null },
        })
      : prisma.platform.create({
          data: { id: nuevoId, tenantId: null, name: input.name, slug: input.slug, description },
        }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'CREATE',
        entity: 'Platform',
        entityId: existente?.id ?? null,
        tenantId: null,
        metadata: { slug: input.slug, global: true },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ]);

  const created = platform as { id: string; name: string; slug: string; description: string | null };

  return { ...created, enabled: false };
}