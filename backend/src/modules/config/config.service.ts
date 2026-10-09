import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import type { Prisma } from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import { planCatalogBump } from '../catalog/catalog.service.js';
import { resolveTenantId } from '../games/games.service.js';
import type { ConfigQuery, UpdateConfigInput } from './config.schemas.js';

export interface ConfigDto {
  tenantId: string;
  publicName: string | null;
  whatsapp: string;
  footer: string;
  showUnavailable: boolean;
  offerOffline: boolean;
  updatedAt: Date | null;
}

interface SettingsRow {
  id: string;
  publicName: string | null;
  whatsapp: string | null;
  footer: string | null;
  showUnavailable: boolean;
  offerOffline: boolean;
  updatedAt: Date;
}

function settingsDto(tenantId: string, row: SettingsRow | null): ConfigDto {
  return {
    tenantId,
    publicName: row?.publicName ?? null,
    whatsapp: row?.whatsapp ?? '',
    footer: row?.footer ?? '',
    showUnavailable: row?.showUnavailable ?? false,
    offerOffline: row?.offerOffline ?? true,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function getConfig(auth: AuthContext | null, query: ConfigQuery): Promise<ConfigDto> {
  const tenantId = await resolveTenantId(auth, query.tenantId);
  const row = await getPrisma().tenantSettings.findUnique({ where: { tenantId } });

  return settingsDto(tenantId, row);
}

export async function updateConfig(
  auth: AuthContext | null,
  query: ConfigQuery,
  patch: UpdateConfigInput,
  meta: RequestMeta,
): Promise<ConfigDto> {
  const prisma = getPrisma();
  const tenantId = await resolveTenantId(auth, query.tenantId);
  const existing = await prisma.tenantSettings.findUnique({ where: { tenantId } });

  const data = {
    ...(patch.publicName !== undefined ? { publicName: patch.publicName } : {}),
    ...(patch.whatsapp !== undefined ? { whatsapp: patch.whatsapp } : {}),
    ...(patch.footer !== undefined ? { footer: patch.footer } : {}),
    ...(patch.showUnavailable !== undefined ? { showUnavailable: patch.showUnavailable } : {}),
    ...(patch.offerOffline !== undefined ? { offerOffline: patch.offerOffline } : {}),
  };

  const settingsId = existing?.id ?? randomUUID();
  const previousShowUnavailable = existing?.showUnavailable ?? false;
  const visibilityChanged =
    patch.showUnavailable !== undefined && patch.showUnavailable !== previousShowUnavailable;

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  if (existing) {
    ops.push(prisma.tenantSettings.update({ where: { id: existing.id }, data }));
  } else {
    ops.push(
      prisma.tenantSettings.create({
        data: {
          id: settingsId,
          tenantId,
          publicName: null,
          whatsapp: null,
          footer: null,
          showUnavailable: false,
          offerOffline: true,
          ...data,
        },
      }),
    );
  }

  if (visibilityChanged) {
    ops.push((await planCatalogBump(tenantId)).op);
  }

  ops.push(
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'CONFIG_UPDATED',
        entity: 'TenantSettings',
        entityId: settingsId,
        tenantId,
        metadata: { fields: Object.keys(patch) },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  );

  await prisma.$transaction(ops);

  return settingsDto(tenantId, {
    id: settingsId,
    publicName: data.publicName !== undefined ? data.publicName : (existing?.publicName ?? null),
    whatsapp: data.whatsapp !== undefined ? data.whatsapp : (existing?.whatsapp ?? null),
    footer: data.footer !== undefined ? data.footer : (existing?.footer ?? null),
    showUnavailable:
      data.showUnavailable !== undefined ? data.showUnavailable : previousShowUnavailable,
    offerOffline:
      data.offerOffline !== undefined ? data.offerOffline : (existing?.offerOffline ?? true),
    updatedAt: new Date(),
  });
}
