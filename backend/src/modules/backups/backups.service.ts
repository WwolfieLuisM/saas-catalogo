import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import type {
  BaseGame,
  Backup,
  Category,
  CatalogMetadata,
  GameMedia,
  GamePlatform,
  Genre,
  Platform,
  PricingRule,
  Prisma,
  TenantGame,
  TenantGameGenre,
  BaseGameGenre,
  BaseGamePlatform,
  TenantSettings,
} from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import type { BackupListQuery, CreateBackupInput, RestoreBackupInput } from './backups.schemas.js';

export type BackupScope = 'PLATAFORMA' | 'TENANT';

interface BackupPayload {
  version: 1;
  scope: BackupScope;
  tenantId: string | null;
  takenAt: string;
  data: {
    baseGames: BaseGame[];
    categories: Category[];
    genres: Genre[];
    platforms: Platform[];
    tenantSettings: TenantSettings[];
    tenantGames: TenantGame[];
    gameMedia: GameMedia[];
    pricingRules: PricingRule[];
    catalogMetadata: CatalogMetadata[];
    tenantGameGenres: TenantGameGenre[];
    gamePlatforms: GamePlatform[];
    baseGameGenres: BaseGameGenre[];
    baseGamePlatforms: BaseGamePlatform[];
  };
}

export interface BackupDto {
  id: string;
  tenantId: string | null;
  type: string;
  scope: BackupScope;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export function backupDto(row: Backup): BackupDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    scope: (row.scope === 'TENANT' ? 'TENANT' : 'PLATAFORMA') as BackupScope,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertAuth(auth: AuthContext | null): AuthContext {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  return auth;
}

async function assertPayload(value: unknown): Promise<BackupPayload> {
  const payload = value as BackupPayload | null;

  if (
    !payload ||
    payload.version !== 1 ||
    (payload.scope !== 'TENANT' && payload.scope !== 'PLATAFORMA') ||
    !payload.data ||
    !Array.isArray(payload.data.tenantGames) ||
    !Array.isArray(payload.data.categories) ||
    !Array.isArray(payload.data.catalogMetadata)
  ) {
    throw new AppError(422, 'BACKUP_PAYLOAD_INVALID', 'La copia no tiene datos restaurables');
  }

  return payload;
}

async function buildPayload(scope: BackupScope, tenantId: string | null): Promise<BackupPayload> {
  const prisma = getPrisma();
  const scoped = scope === 'TENANT';
  const tenantWhere = scoped ? { tenantId: tenantId as string } : {};

  const tenantGames = await prisma.tenantGame.findMany({ where: tenantWhere });
  const gameIds = tenantGames.map((game) => game.id);

  const [
    baseGames,
    categories,
    genres,
    platforms,
    tenantSettings,
    gameMedia,
    pricingRules,
    catalogMetadata,
    tenantGameGenres,
    gamePlatforms,
    baseGameGenres,
    baseGamePlatforms,
  ] = await Promise.all([
    scoped ? Promise.resolve([] as BaseGame[]) : prisma.baseGame.findMany(),
    prisma.category.findMany({ where: tenantWhere }),
    prisma.genre.findMany({ where: tenantWhere }),
    prisma.platform.findMany({ where: tenantWhere }),
    prisma.tenantSettings.findMany({ where: tenantWhere }),
    prisma.gameMedia.findMany({ where: tenantWhere }),
    prisma.pricingRule.findMany({ where: tenantWhere }),
    prisma.catalogMetadata.findMany({ where: tenantWhere }),
    gameIds.length
      ? prisma.tenantGameGenre.findMany({ where: { tenantGameId: { in: gameIds } } })
      : Promise.resolve([] as TenantGameGenre[]),
    gameIds.length
      ? prisma.gamePlatform.findMany({ where: { tenantGameId: { in: gameIds } } })
      : Promise.resolve([] as GamePlatform[]),
    scoped ? Promise.resolve([] as BaseGameGenre[]) : prisma.baseGameGenre.findMany(),
    scoped ? Promise.resolve([] as BaseGamePlatform[]) : prisma.baseGamePlatform.findMany(),
  ]);

  return {
    version: 1,
    scope,
    tenantId,
    takenAt: new Date().toISOString(),
    data: {
      baseGames,
      categories,
      genres,
      platforms,
      tenantSettings,
      tenantGames,
      gameMedia,
      pricingRules,
      catalogMetadata,
      tenantGameGenres,
      gamePlatforms,
      baseGameGenres,
      baseGamePlatforms,
    },
  };
}

export async function listBackups(
  auth: AuthContext | null,
  query: BackupListQuery,
): Promise<{ items: Backup[]; total: number }> {
  const prisma = getPrisma();
  const actor = assertAuth(auth);
  let where: Prisma.BackupWhereInput = {};

  if (actor.role === 'ADMIN') {
    if (!actor.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Cuenta ADMIN sin tenant asignado');
    }
    if (query.tenantId && query.tenantId !== actor.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'No puedes operar sobre otro tenant');
    }
    where = { tenantId: actor.tenantId };
  } else if (query.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: query.tenantId } });

    if (!tenant) {
      throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
    }
    where = { tenantId: query.tenantId };
  }

  const [items, total] = await Promise.all([
    prisma.backup.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.backup.count({ where }),
  ]);

  return { items, total };
}

export async function createBackup(
  auth: AuthContext | null,
  input: CreateBackupInput,
  meta: RequestMeta,
): Promise<BackupDto> {
  const prisma = getPrisma();
  const actor = assertAuth(auth);

  let scope: BackupScope;
  let tenantId: string | null = null;

  if (actor.role === 'ADMIN') {
    if (!actor.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Cuenta ADMIN sin tenant asignado');
    }
    if (input.tenantId && input.tenantId !== actor.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'No puedes operar sobre otro tenant');
    }
    scope = 'TENANT';
    tenantId = actor.tenantId;
  } else if (input.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });

    if (!tenant) {
      throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
    }
    scope = 'TENANT';
    tenantId = input.tenantId;
  } else {
    scope = 'PLATAFORMA';
  }

  const payload = await buildPayload(scope, tenantId);
  const serialized = JSON.parse(JSON.stringify(payload)) as BackupPayload;
  const id = randomUUID();

  const [created] = await prisma.$transaction([
    prisma.backup.create({
      data: {
        id,
        tenantId,
        type: input.type,
        scope,
        status: 'COMPLETED',
        payload: serialized as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.auditLog.create({
      data: auditData({
        actor,
        action: 'BACKUP_CREATED',
        entity: 'Backup',
        entityId: id,
        tenantId,
        metadata: { type: input.type, scope },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ]);

  return backupDto(created as Backup);
}

export async function restoreBackup(
  id: string,
  input: RestoreBackupInput,
  actor: AuthContext | null,
  meta: RequestMeta,
): Promise<BackupDto> {
  const prisma = getPrisma();
  const auth = assertAuth(actor);

  const backup = await prisma.backup.findUnique({ where: { id } });

  if (!backup) {
    throw new AppError(404, 'BACKUP_NOT_FOUND', 'Copia no encontrada');
  }

  if (input.confirm !== 'RESTAURAR') {
    throw new AppError(422, 'RESTORE_CONFIRM_REQUIRED', 'Escribe RESTAURAR para confirmar');
  }

  const payload = await assertPayload(backup.payload);
  const scope: BackupScope = payload.scope === 'TENANT' ? 'TENANT' : 'PLATAFORMA';

  if (scope === 'TENANT' && !backup.tenantId) {
    throw new AppError(422, 'BACKUP_PAYLOAD_INVALID', 'La copia no tiene datos restaurables');
  }

  const currentMetadata = await prisma.catalogMetadata.findMany();
  const currentVersions = new Map(currentMetadata.map((row) => [row.tenantId, row.version]));
  const data = payload.data;

  const restoredVersion = (tenantId: string, payloadVersion: number): number =>
    Math.max(currentVersions.get(tenantId) ?? 0, payloadVersion) + 1;

  const ensureVersion = async (tx: Prisma.TransactionClient, tenantId: string): Promise<void> => {
    const existing = await tx.catalogMetadata.findUnique({ where: { tenantId } });

    if (!existing) {
      await tx.catalogMetadata.create({
        data: { id: randomUUID(), tenantId, version: (currentVersions.get(tenantId) ?? 0) + 1 },
      });
    }
  };

  await prisma.$transaction(async (tx) => {
    if (scope === 'PLATAFORMA') {
      await tx.gameMedia.deleteMany({});
      await tx.tenantGameGenre.deleteMany({});
      await tx.gamePlatform.deleteMany({});
      await tx.baseGameGenre.deleteMany({});
      await tx.baseGamePlatform.deleteMany({});
      await tx.tenantGame.deleteMany({});
      await tx.baseGame.deleteMany({});
      await tx.tenantSettings.deleteMany({});
      await tx.pricingRule.deleteMany({});
      await tx.catalogMetadata.deleteMany({});
      await tx.category.deleteMany({});
      await tx.genre.deleteMany({});
      await tx.platform.deleteMany({});

      await tx.category.createMany({
        data: data.categories as unknown as Prisma.CategoryCreateManyInput[],
      });
      await tx.genre.createMany({
        data: data.genres as unknown as Prisma.GenreCreateManyInput[],
      });
      await tx.platform.createMany({
        data: data.platforms as unknown as Prisma.PlatformCreateManyInput[],
      });
      await tx.baseGame.createMany({
        data: data.baseGames as unknown as Prisma.BaseGameCreateManyInput[],
      });
      await tx.baseGameGenre.createMany({
        data: data.baseGameGenres as unknown as Prisma.BaseGameGenreCreateManyInput[],
      });
      await tx.baseGamePlatform.createMany({
        data: data.baseGamePlatforms as unknown as Prisma.BaseGamePlatformCreateManyInput[],
      });
      await tx.tenantSettings.createMany({
        data: data.tenantSettings as unknown as Prisma.TenantSettingsCreateManyInput[],
      });
      await tx.tenantGame.createMany({
        data: data.tenantGames as unknown as Prisma.TenantGameCreateManyInput[],
      });
      await tx.tenantGameGenre.createMany({
        data: data.tenantGameGenres as unknown as Prisma.TenantGameGenreCreateManyInput[],
      });
      await tx.gamePlatform.createMany({
        data: data.gamePlatforms as unknown as Prisma.GamePlatformCreateManyInput[],
      });
      await tx.gameMedia.createMany({
        data: data.gameMedia as unknown as Prisma.GameMediaCreateManyInput[],
      });
      await tx.pricingRule.createMany({
        data: data.pricingRules as unknown as Prisma.PricingRuleCreateManyInput[],
      });
      await tx.catalogMetadata.createMany({
        data: data.catalogMetadata.map((row) => ({
          ...(row as unknown as Prisma.CatalogMetadataCreateManyInput),
          version: restoredVersion(row.tenantId, row.version),
        })),
      });
      for (const tenantId of currentVersions.keys()) {
        await ensureVersion(tx, tenantId);
      }
    } else {
      const tenantId = backup.tenantId as string;
      const currentGames = await tx.tenantGame.findMany({ where: { tenantId } });
      const gameIds = currentGames.map((game) => game.id);

      await tx.gameMedia.deleteMany({ where: { tenantId } });
      if (gameIds.length) {
        await tx.tenantGameGenre.deleteMany({ where: { tenantGameId: { in: gameIds } } });
        await tx.gamePlatform.deleteMany({ where: { tenantGameId: { in: gameIds } } });
      }
      await tx.tenantGame.deleteMany({ where: { tenantId } });
      await tx.category.deleteMany({ where: { tenantId } });
      await tx.genre.deleteMany({ where: { tenantId } });
      await tx.platform.deleteMany({ where: { tenantId } });
      await tx.tenantSettings.deleteMany({ where: { tenantId } });
      await tx.pricingRule.deleteMany({ where: { tenantId } });
      await tx.catalogMetadata.deleteMany({ where: { tenantId } });

      await tx.category.createMany({
        data: data.categories as unknown as Prisma.CategoryCreateManyInput[],
      });
      await tx.genre.createMany({
        data: data.genres as unknown as Prisma.GenreCreateManyInput[],
      });
      await tx.platform.createMany({
        data: data.platforms as unknown as Prisma.PlatformCreateManyInput[],
      });
      await tx.tenantSettings.createMany({
        data: data.tenantSettings as unknown as Prisma.TenantSettingsCreateManyInput[],
      });
      await tx.tenantGame.createMany({
        data: data.tenantGames as unknown as Prisma.TenantGameCreateManyInput[],
      });
      await tx.tenantGameGenre.createMany({
        data: data.tenantGameGenres as unknown as Prisma.TenantGameGenreCreateManyInput[],
      });
      await tx.gamePlatform.createMany({
        data: data.gamePlatforms as unknown as Prisma.GamePlatformCreateManyInput[],
      });
      await tx.gameMedia.createMany({
        data: data.gameMedia as unknown as Prisma.GameMediaCreateManyInput[],
      });
      await tx.pricingRule.createMany({
        data: data.pricingRules as unknown as Prisma.PricingRuleCreateManyInput[],
      });
      await tx.catalogMetadata.createMany({
        data: data.catalogMetadata.map((row) => ({
          ...(row as unknown as Prisma.CatalogMetadataCreateManyInput),
          version: restoredVersion(row.tenantId, row.version),
        })),
      });
      await ensureVersion(tx, backup.tenantId as string);
    }

    await tx.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'RESTORE_COMPLETED',
        entity: 'Backup',
        entityId: backup.id,
        tenantId: backup.tenantId,
        metadata: { scope, games: data.tenantGames.length },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    });
  });

  return backupDto(backup);
}
