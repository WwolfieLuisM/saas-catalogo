import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import type { AuthContext } from '../../middleware/auth.js';
import type { BaseGame, Prisma } from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import { assertTaxonomyRefs, jsonValue, resolveRequirements } from '../games/game.shared.js';
import type {
  BaseGamesListQuery,
  CreateBaseGameInput,
  UpdateBaseGameInput,
} from './base-games.schemas.js';

interface TaxonomySummary {
  id: string;
  name: string;
  slug: string;
}

interface BaseGameDetail {
  category: TaxonomySummary | null;
  genres: TaxonomySummary[];
  platforms: TaxonomySummary[];
}

function summary(
  row: { id: string; name: string; slug: string } | null | undefined,
): TaxonomySummary | null {
  return row ? { id: row.id, name: row.name, slug: row.slug } : null;
}

function orderByFromSort(sort: string): Prisma.BaseGameOrderByWithRelationInput {
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  return { [field]: direction } as Prisma.BaseGameOrderByWithRelationInput;
}

async function loadDetails(rows: BaseGame[]): Promise<Map<string, BaseGameDetail>> {
  const prisma = getPrisma();
  const details = new Map<string, BaseGameDetail>();
  if (rows.length === 0) return details;

  const ids = rows.map((row) => row.id);
  const [genreBridges, platformBridges] = await Promise.all([
    prisma.baseGameGenre.findMany({ where: { baseGameId: { in: ids } } }),
    prisma.baseGamePlatform.findMany({ where: { baseGameId: { in: ids } } }),
  ]);

  const genreIds = [...new Set(genreBridges.map((bridge) => bridge.genreId))];
  const platformIds = [...new Set(platformBridges.map((bridge) => bridge.platformId))];
  const categoryIds = [
    ...new Set(rows.map((row) => row.categoryId).filter((id): id is string => id !== null)),
  ];

  const [genres, platforms, categories] = await Promise.all([
    genreIds.length
      ? prisma.genre.findMany({ where: { id: { in: genreIds }, tenantId: null } })
      : Promise.resolve([]),
    platformIds.length
      ? prisma.platform.findMany({ where: { id: { in: platformIds }, tenantId: null } })
      : Promise.resolve([]),
    categoryIds.length
      ? prisma.category.findMany({ where: { id: { in: categoryIds }, tenantId: null } })
      : Promise.resolve([]),
  ]);

  const genreById = new Map(genres.map((genre) => [genre.id, genre]));
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  for (const row of rows) {
    details.set(row.id, {
      category: summary(categoryById.get(row.categoryId ?? '')) ?? null,
      genres: genreBridges
        .filter((bridge) => bridge.baseGameId === row.id)
        .map((bridge) => summary(genreById.get(bridge.genreId)))
        .filter((value): value is TaxonomySummary => value !== null),
      platforms: platformBridges
        .filter((bridge) => bridge.baseGameId === row.id)
        .map((bridge) => summary(platformById.get(bridge.platformId)))
        .filter((value): value is TaxonomySummary => value !== null),
    });
  }

  return details;
}

export function baseGameDto(row: BaseGame, detail: BaseGameDetail) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    sizeValue: row.sizeValue,
    sizeUnit: row.sizeUnit,
    releaseYear: row.releaseYear,
    categoryId: row.categoryId,
    category: detail.category,
    genres: detail.genres,
    platforms: detail.platforms,
    minimumRequirements: row.minimumRequirements,
    recommendedRequirements: row.recommendedRequirements,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedBy: row.deletedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findRow(id: string, includeDeleted: boolean): Promise<BaseGame> {
  const prisma = getPrisma();
  const row = includeDeleted
    ? await prisma.baseGame.findFirst({ where: { id } })
    : await prisma.baseGame.findFirst({ where: { id, deletedAt: null } });

  if (!row) {
    throw new AppError(404, 'BASE_GAME_NOT_FOUND', 'Juego de biblioteca no encontrado');
  }

  return row;
}

export async function listBaseGames(query: BaseGamesListQuery) {
  const prisma = getPrisma();
  const where: Prisma.BaseGameWhereInput = {
    AND: [
      { deletedAt: null },
      query.categoryId ? { categoryId: query.categoryId } : {},
      query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.baseGame.findMany({
      where,
      orderBy: orderByFromSort(query.sort),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.baseGame.count({ where }),
  ]);

  const details = await loadDetails(items);
  return {
    items: items.map((row) => baseGameDto(row, details.get(row.id) as BaseGameDetail)),
    total,
  };
}

export async function getBaseGame(id: string) {
  const row = await findRow(id, false);
  const details = await loadDetails([row]);
  return baseGameDto(row, details.get(row.id) as BaseGameDetail);
}

export async function createBaseGame(
  input: CreateBaseGameInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  const prisma = getPrisma();
  const existing = await prisma.baseGame.findFirst({ where: { slug: input.slug } });
  if (existing) {
    throw new AppError(
      409,
      'BASE_GAME_SLUG_EXISTS',
      'Ya existe un juego de biblioteca con ese slug',
    );
  }

  await assertTaxonomyRefs(null, {
    categoryId: input.categoryId,
    genreIds: input.genreIds,
    platformIds: input.platformIds,
  });

  const { minimumRequirements, recommendedRequirements } = resolveRequirements(
    input.minimumRequirements,
    input.recommendedRequirements,
  );

  const id = randomUUID();
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.baseGame.create({
      data: {
        id,
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        sizeValue: input.sizeValue,
        sizeUnit: input.sizeUnit,
        releaseYear: input.releaseYear ?? null,
        categoryId: input.categoryId ?? null,
        minimumRequirements: jsonValue(minimumRequirements),
        recommendedRequirements: jsonValue(recommendedRequirements),
        createdBy: auth.id,
        updatedBy: auth.id,
      },
    }),
  ];

  if (input.genreIds?.length) {
    ops.push(
      prisma.baseGameGenre.createMany({
        data: input.genreIds.map((genreId) => ({ baseGameId: id, genreId })),
      }),
    );
  }

  if (input.platformIds?.length) {
    ops.push(
      prisma.baseGamePlatform.createMany({
        data: input.platformIds.map((platformId) => ({ baseGameId: id, platformId })),
      }),
    );
  }

  ops.push(
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'CREATE',
        entity: 'BaseGame',
        entityId: id,
        tenantId: null,
        metadata: { title: input.title, slug: input.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  );

  const [row] = (await prisma.$transaction(ops)) as [BaseGame, ...unknown[]];
  const details = await loadDetails([row]);
  return baseGameDto(row, details.get(row.id) as BaseGameDetail);
}

export async function updateBaseGame(
  id: string,
  input: UpdateBaseGameInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  const row = await findRow(id, false);
  const prisma = getPrisma();

  if (input.slug !== undefined && input.slug !== row.slug) {
    const existing = await prisma.baseGame.findFirst({
      where: { slug: input.slug, id: { not: row.id } },
    });
    if (existing) {
      throw new AppError(
        409,
        'BASE_GAME_SLUG_EXISTS',
        'Ya existe un juego de biblioteca con ese slug',
      );
    }
  }

  await assertTaxonomyRefs(null, {
    categoryId: input.categoryId ?? undefined,
    genreIds: input.genreIds,
    platformIds: input.platformIds,
  });

  const data: Prisma.BaseGameUpdateInput = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.sizeValue !== undefined ? { sizeValue: input.sizeValue } : {}),
    ...(input.sizeUnit !== undefined ? { sizeUnit: input.sizeUnit } : {}),
    ...(input.releaseYear !== undefined ? { releaseYear: input.releaseYear ?? null } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
    updatedBy: auth.id,
  };

  if (input.minimumRequirements !== undefined || input.recommendedRequirements !== undefined) {
    const resolveUpdate = resolveRequirements(
      input.minimumRequirements ??
        (row.minimumRequirements as Record<string, string> | null) ??
        undefined,
      input.recommendedRequirements,
    );
    if (input.minimumRequirements !== undefined && input.recommendedRequirements === undefined) {
      data.minimumRequirements = jsonValue(resolveUpdate.minimumRequirements);
      data.recommendedRequirements = jsonValue(resolveUpdate.recommendedRequirements);
    } else {
      if (input.minimumRequirements !== undefined) {
        data.minimumRequirements = input.minimumRequirements as Prisma.InputJsonValue;
      }
      if (input.recommendedRequirements !== undefined) {
        data.recommendedRequirements = input.recommendedRequirements as Prisma.InputJsonValue;
      }
    }
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.baseGame.update({ where: { id: row.id }, data }),
  ];

  if (input.genreIds !== undefined) {
    ops.push(prisma.baseGameGenre.deleteMany({ where: { baseGameId: row.id } }));
    if (input.genreIds.length) {
      ops.push(
        prisma.baseGameGenre.createMany({
          data: input.genreIds.map((genreId) => ({ baseGameId: row.id, genreId })),
        }),
      );
    }
  }

  if (input.platformIds !== undefined) {
    ops.push(prisma.baseGamePlatform.deleteMany({ where: { baseGameId: row.id } }));
    if (input.platformIds.length) {
      ops.push(
        prisma.baseGamePlatform.createMany({
          data: input.platformIds.map((platformId) => ({ baseGameId: row.id, platformId })),
        }),
      );
    }
  }

  ops.push(
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'UPDATE',
        entity: 'BaseGame',
        entityId: row.id,
        tenantId: null,
        metadata: { fields: Object.keys(input) },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  );

  const [updated] = (await prisma.$transaction(ops)) as [BaseGame, ...unknown[]];
  const details = await loadDetails([updated]);
  return baseGameDto(updated, details.get(updated.id) as BaseGameDetail);
}

export async function deleteBaseGame(id: string, auth: AuthContext | null, meta: RequestMeta) {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  const row = await findRow(id, false);
  const prisma = getPrisma();

  const [deleted] = (await prisma.$transaction([
    prisma.baseGame.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), deletedBy: auth.id, updatedBy: auth.id },
    }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'DELETE',
        entity: 'BaseGame',
        entityId: row.id,
        tenantId: null,
        metadata: { title: row.title, slug: row.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ])) as [BaseGame, ...unknown[]];

  const details = await loadDetails([deleted]);
  return baseGameDto(deleted, details.get(deleted.id) as BaseGameDetail);
}

export async function restoreBaseGame(id: string, auth: AuthContext | null, meta: RequestMeta) {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  const row = await findRow(id, true);
  if (!row.deletedAt) {
    throw new AppError(409, 'NOT_DELETED', 'El juego de biblioteca no está eliminado');
  }

  const prisma = getPrisma();
  const [restored] = (await prisma.$transaction([
    prisma.baseGame.update({
      where: { id: row.id },
      data: { deletedAt: null, deletedBy: null, updatedBy: auth.id },
    }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'RESTORE',
        entity: 'BaseGame',
        entityId: row.id,
        tenantId: null,
        metadata: { title: row.title, slug: row.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ])) as [BaseGame, ...unknown[]];

  const details = await loadDetails([restored]);
  return baseGameDto(restored, details.get(restored.id) as BaseGameDetail);
}
