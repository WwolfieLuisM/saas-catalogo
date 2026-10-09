import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import type { AuthContext } from '../../middleware/auth.js';
import type { Prisma, TenantGame } from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import { planCatalogBump } from '../catalog/catalog.service.js';
import { assertTaxonomyRefs, jsonValue, resolveRequirements } from './game.shared.js';
import type { CreateGameInput, GamesListQuery, UpdateGameInput } from './games.schemas.js';

interface TaxonomySummary {
  id: string;
  name: string;
  slug: string;
}

interface GameDetail {
  category: TaxonomySummary | null;
  genres: TaxonomySummary[];
  platforms: TaxonomySummary[];
  baseGame: { id: string; slug: string; title: string } | null;
}

function summary(
  row: { id: string; name: string; slug: string } | null | undefined,
): TaxonomySummary | null {
  return row ? { id: row.id, name: row.name, slug: row.slug } : null;
}

export async function resolveTenantId(
  auth: AuthContext | null,
  requested: string | undefined,
): Promise<string> {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  if (auth.role === 'ADMIN') {
    if (!auth.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Cuenta ADMIN sin tenant asignado');
    }
    if (requested && requested !== auth.tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'No puedes operar sobre otro tenant');
    }
    return auth.tenantId;
  }

  if (auth.role === 'SUPER_ADMIN') {
    if (!requested) {
      throw new AppError(400, 'VALIDATION_ERROR', 'tenantId es obligatorio para SUPER_ADMIN');
    }
    const tenant = await getPrisma().tenant.findUnique({ where: { id: requested } });

    if (!tenant) {
      throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
    }
    return requested;
  }

  throw new AppError(403, 'FORBIDDEN', 'Rol no autorizado');
}

function assertRowAccess(row: TenantGame, auth: AuthContext | null): void {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  if (auth.role === 'ADMIN' && row.tenantId !== auth.tenantId) {
    throw new AppError(404, 'GAME_NOT_FOUND', 'Juego no encontrado');
  }
}

function orderByFromSort(sort: string): Prisma.TenantGameOrderByWithRelationInput {
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  return { [field]: direction } as Prisma.TenantGameOrderByWithRelationInput;
}

async function loadDetails(rows: TenantGame[]): Promise<Map<string, GameDetail>> {
  const prisma = getPrisma();
  const details = new Map<string, GameDetail>();
  if (rows.length === 0) return details;

  const ids = rows.map((row) => row.id);
  const tenantIds = [...new Set(rows.map((row) => row.tenantId))];
  const [genreBridges, platformBridges] = await Promise.all([
    prisma.tenantGameGenre.findMany({ where: { tenantGameId: { in: ids } } }),
    prisma.gamePlatform.findMany({ where: { tenantGameId: { in: ids } } }),
  ]);

  const genreIds = [...new Set(genreBridges.map((bridge) => bridge.genreId))];
  const platformIds = [...new Set(platformBridges.map((bridge) => bridge.platformId))];
  const categoryIds = [
    ...new Set(rows.map((row) => row.categoryId).filter((id): id is string => id !== null)),
  ];
  const baseGameIds = [
    ...new Set(rows.map((row) => row.baseGameId).filter((id): id is string => id !== null)),
  ];

  const [genres, platforms, categories, baseGames] = await Promise.all([
    genreIds.length
      ? prisma.genre.findMany({ where: { id: { in: genreIds }, tenantId: { in: tenantIds } } })
      : Promise.resolve([]),
    platformIds.length
      ? prisma.platform.findMany({
          where: { id: { in: platformIds }, tenantId: { in: tenantIds } },
        })
      : Promise.resolve([]),
    categoryIds.length
      ? prisma.category.findMany({
          where: { id: { in: categoryIds }, tenantId: { in: tenantIds } },
        })
      : Promise.resolve([]),
    baseGameIds.length
      ? prisma.baseGame.findMany({ where: { id: { in: baseGameIds } } })
      : Promise.resolve([]),
  ]);

  const genreById = new Map(genres.map((genre) => [genre.id, genre]));
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const baseGameById = new Map(baseGames.map((game) => [game.id, game]));

  for (const row of rows) {
    const base = row.baseGameId ? baseGameById.get(row.baseGameId) : undefined;
    details.set(row.id, {
      category: summary(categoryById.get(row.categoryId ?? '')) ?? null,
      genres: genreBridges
        .filter((bridge) => bridge.tenantGameId === row.id)
        .map((bridge) => summary(genreById.get(bridge.genreId)))
        .filter((value): value is TaxonomySummary => value !== null),
      platforms: platformBridges
        .filter((bridge) => bridge.tenantGameId === row.id)
        .map((bridge) => summary(platformById.get(bridge.platformId)))
        .filter((value): value is TaxonomySummary => value !== null),
      baseGame: base ? { id: base.id, slug: base.slug, title: base.title } : null,
    });
  }

  return details;
}

export function tenantGameDto(row: TenantGame, detail: GameDetail) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    baseGameId: row.baseGameId,
    baseGame: detail.baseGame,
    origin: row.origin,
    title: row.title,
    slug: row.slug,
    description: row.description,
    priceMode: row.priceMode,
    price: row.price === null ? null : Number(row.price),
    availability: row.availability,
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

async function findRow(id: string, includeDeleted: boolean): Promise<TenantGame> {
  const prisma = getPrisma();
  const row = includeDeleted
    ? await prisma.tenantGame.findFirst({ where: { id } })
    : await prisma.tenantGame.findFirst({ where: { id, deletedAt: null } });

  if (!row) {
    throw new AppError(404, 'GAME_NOT_FOUND', 'Juego no encontrado');
  }

  return row;
}

export async function listGames(query: GamesListQuery, auth: AuthContext | null) {
  const tenantId = await resolveTenantId(auth, query.tenantId);
  const prisma = getPrisma();

  const where: Prisma.TenantGameWhereInput = {
    AND: [
      { tenantId },
      { deletedAt: null },
      query.origin ? { origin: query.origin } : {},
      query.availability !== undefined ? { availability: query.availability } : {},
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
    prisma.tenantGame.findMany({
      where,
      orderBy: orderByFromSort(query.sort),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.tenantGame.count({ where }),
  ]);

  const details = await loadDetails(items);
  return {
    items: items.map((row) => tenantGameDto(row, details.get(row.id) as GameDetail)),
    total,
  };
}

export async function getGame(id: string, auth: AuthContext | null) {
  const row = await findRow(id, false);
  assertRowAccess(row, auth);
  const details = await loadDetails([row]);
  return tenantGameDto(row, details.get(row.id) as GameDetail);
}

async function publishFromLibrary(
  input: CreateGameInput,
  tenantId: string,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  const prisma = getPrisma();
  const base = await prisma.baseGame.findFirst({
    where: { id: input.baseGameId as string, deletedAt: null },
  });

  if (!base) {
    throw new AppError(
      422,
      'BASE_GAME_NOT_FOUND',
      'El juego de biblioteca no existe o está eliminado',
    );
  }

  const duplicate = await prisma.tenantGame.findFirst({
    where: { tenantId, baseGameId: base.id },
  });
  if (duplicate) {
    throw new AppError(409, 'DUPLICATE_PUBLICATION', 'Este juego ya está publicado en el catálogo');
  }

  const slugTaken = await prisma.tenantGame.findFirst({ where: { tenantId, slug: base.slug } });
  if (slugTaken) {
    throw new AppError(409, 'GAME_SLUG_EXISTS', 'Ya existe un juego con ese slug en el catálogo');
  }

  const explicit = {
    categoryId: input.categoryId,
    genreIds: input.genreIds,
    platformIds: input.platformIds,
  };

  if (
    explicit.categoryId !== undefined ||
    explicit.genreIds !== undefined ||
    explicit.platformIds !== undefined
  ) {
    await assertTaxonomyRefs(tenantId, {
      categoryId: explicit.categoryId ?? undefined,
      genreIds: explicit.genreIds,
      platformIds: explicit.platformIds,
    });
  }

  let categoryId = input.categoryId ?? null;
  let genreIds = input.genreIds ?? null;
  let platformIds = input.platformIds ?? null;
  const missing: { categories: string[]; genres: string[]; platforms: string[] } = {
    categories: [],
    genres: [],
    platforms: [],
  };

  if (categoryId === null && input.categoryId === undefined) {
    if (base.categoryId) {
      const globalCategory = await prisma.category.findFirst({
        where: { id: base.categoryId, tenantId: null, deletedAt: null },
      });
      if (globalCategory) {
        const tenantCategory = await prisma.category.findFirst({
          where: { tenantId, slug: globalCategory.slug, deletedAt: null },
        });
        if (tenantCategory) {
          categoryId = tenantCategory.id;
        } else {
          missing.categories.push(globalCategory.slug);
        }
      }
    }
  }

  if (genreIds === null && input.genreIds === undefined) {
    const bridges = await prisma.baseGameGenre.findMany({ where: { baseGameId: base.id } });
    const genreIdList = bridges.map((bridge) => bridge.genreId);
    const resolved: string[] = [];
    if (genreIdList.length) {
      const globalGenres = await prisma.genre.findMany({
        where: { id: { in: genreIdList }, tenantId: null, deletedAt: null },
      });
      for (const globalGenre of globalGenres) {
        const tenantGenre = await prisma.genre.findFirst({
          where: { tenantId, slug: globalGenre.slug, deletedAt: null },
        });
        if (tenantGenre) {
          resolved.push(tenantGenre.id);
        } else {
          missing.genres.push(globalGenre.slug);
        }
      }
    }
    genreIds = resolved;
  }

  if (platformIds === null && input.platformIds === undefined) {
    const bridges = await prisma.baseGamePlatform.findMany({ where: { baseGameId: base.id } });
    const platformIdList = bridges.map((bridge) => bridge.platformId);
    const resolved: string[] = [];
    if (platformIdList.length) {
      const globalPlatforms = await prisma.platform.findMany({
        where: { id: { in: platformIdList }, tenantId: null, deletedAt: null },
      });
      for (const globalPlatform of globalPlatforms) {
        const tenantPlatform = await prisma.platform.findFirst({
          where: { tenantId, slug: globalPlatform.slug, deletedAt: null },
        });
        if (tenantPlatform) {
          resolved.push(tenantPlatform.id);
        } else {
          missing.platforms.push(globalPlatform.slug);
        }
      }
    }
    platformIds = resolved;
  }

  if (missing.categories.length || missing.genres.length || missing.platforms.length) {
    throw new AppError(
      422,
      'TAXONOMY_MAPPING_INCOMPLETE',
      'El catálogo no tiene equivalencias para toda la taxonomía de la biblioteca',
      { missing },
    );
  }

  const id = randomUUID();
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.tenantGame.create({
      data: {
        id,
        tenantId,
        baseGameId: base.id,
        origin: 'BIBLIOTECA',
        title: base.title,
        slug: base.slug,
        description: base.description,
        priceMode: input.priceMode,
        price: input.price ?? null,
        availability: input.availability,
        sizeValue: base.sizeValue,
        sizeUnit: base.sizeUnit,
        releaseYear: base.releaseYear,
        categoryId,
        minimumRequirements: jsonValue(base.minimumRequirements),
        recommendedRequirements: jsonValue(base.recommendedRequirements),
        createdBy: auth?.id ?? null,
        updatedBy: auth?.id ?? null,
      },
    }),
  ];

  if (genreIds?.length) {
    ops.push(
      prisma.tenantGameGenre.createMany({
        data: genreIds.map((genreId) => ({ tenantGameId: id, genreId })),
      }),
    );
  }

  if (platformIds?.length) {
    ops.push(
      prisma.gamePlatform.createMany({
        data: platformIds.map((platformId) => ({ tenantGameId: id, platformId })),
      }),
    );
  }

  ops.push(
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'CREATE',
        entity: 'TenantGame',
        entityId: id,
        tenantId,
        metadata: { origin: 'BIBLIOTECA', baseGameId: base.id, slug: base.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  );

  if (input.availability) {
    ops.push((await planCatalogBump(tenantId)).op);
  }

  const [row] = (await prisma.$transaction(ops)) as [TenantGame, ...unknown[]];
  return row;
}

export async function createGame(
  input: CreateGameInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  const tenantId = await resolveTenantId(auth, input.tenantId);
  const prisma = getPrisma();

  let row: TenantGame;

  if (input.baseGameId) {
    row = await publishFromLibrary(input, tenantId, auth, meta);
  } else {
    const slugTaken = await prisma.tenantGame.findFirst({ where: { tenantId, slug: input.slug } });
    if (slugTaken) {
      throw new AppError(409, 'GAME_SLUG_EXISTS', 'Ya existe un juego con ese slug en el catálogo');
    }

    await assertTaxonomyRefs(tenantId, {
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
      prisma.tenantGame.create({
        data: {
          id,
          tenantId,
          baseGameId: null,
          origin: 'PERSONALIZADO',
          title: input.title as string,
          slug: input.slug as string,
          description: input.description ?? null,
          priceMode: input.priceMode,
          price: input.price ?? null,
          availability: input.availability,
          sizeValue: input.sizeValue as number,
          sizeUnit: input.sizeUnit as 'MB' | 'GB' | 'TB',
          releaseYear: input.releaseYear ?? null,
          categoryId: input.categoryId ?? null,
          minimumRequirements: jsonValue(minimumRequirements),
          recommendedRequirements: jsonValue(recommendedRequirements),
          createdBy: auth?.id ?? null,
          updatedBy: auth?.id ?? null,
        },
      }),
    ];

    if (input.genreIds?.length) {
      ops.push(
        prisma.tenantGameGenre.createMany({
          data: input.genreIds.map((genreId) => ({ tenantGameId: id, genreId })),
        }),
      );
    }

    if (input.platformIds?.length) {
      ops.push(
        prisma.gamePlatform.createMany({
          data: input.platformIds.map((platformId) => ({ tenantGameId: id, platformId })),
        }),
      );
    }

    ops.push(
      prisma.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'CREATE',
          entity: 'TenantGame',
          entityId: id,
          tenantId,
          metadata: { origin: 'PERSONALIZADO', slug: input.slug },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    );

    if (input.availability) {
      ops.push((await planCatalogBump(tenantId)).op);
    }

    const [created] = (await prisma.$transaction(ops)) as [TenantGame, ...unknown[]];
    row = created;
  }

  const details = await loadDetails([row]);
  return tenantGameDto(row, details.get(row.id) as GameDetail);
}

export async function updateGame(
  id: string,
  input: UpdateGameInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  const row = await findRow(id, false);
  assertRowAccess(row, auth);
  const prisma = getPrisma();

  const libraryLockedKeys = [
    'title',
    'slug',
    'description',
    'sizeValue',
    'sizeUnit',
    'releaseYear',
    'minimumRequirements',
    'recommendedRequirements',
  ] as const;

  if (row.origin === 'BIBLIOTECA') {
    const touched = libraryLockedKeys.filter((key) => input[key] !== undefined);
    if (touched.length > 0) {
      throw new AppError(
        422,
        'LIBRARY_FIELDS_IMMUTABLE',
        'Los metadatos de la biblioteca no se pueden modificar desde el catálogo',
        { fields: touched },
      );
    }
  }

  if (row.origin === 'PERSONALIZADO' && input.slug !== undefined && input.slug !== row.slug) {
    const existing = await prisma.tenantGame.findFirst({
      where: { tenantId: row.tenantId, slug: input.slug, id: { not: row.id } },
    });
    if (existing) {
      throw new AppError(409, 'GAME_SLUG_EXISTS', 'Ya existe un juego con ese slug en el catálogo');
    }
  }

  const newPriceMode = input.priceMode ?? row.priceMode;
  if (input.price !== undefined && newPriceMode === 'RULE') {
    throw new AppError(422, 'PRICE_ONLY_MANUAL', 'price solo aplica cuando priceMode es MANUAL');
  }

  let newPrice: typeof row.price | number = row.price;
  if (newPriceMode === 'RULE') {
    newPrice = null;
  } else if (input.price !== undefined) {
    newPrice = input.price;
  } else if (row.price === null) {
    throw new AppError(422, 'PRICE_REQUIRED', 'price es obligatorio cuando priceMode es MANUAL');
  }

  await assertTaxonomyRefs(row.tenantId, {
    categoryId: input.categoryId ?? undefined,
    genreIds: input.genreIds,
    platformIds: input.platformIds,
  });

  const data: Prisma.TenantGameUpdateInput = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.availability !== undefined ? { availability: input.availability } : {}),
    ...(input.sizeValue !== undefined ? { sizeValue: input.sizeValue } : {}),
    ...(input.sizeUnit !== undefined ? { sizeUnit: input.sizeUnit } : {}),
    ...(input.releaseYear !== undefined ? { releaseYear: input.releaseYear ?? null } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
    priceMode: newPriceMode,
    price: newPrice,
    updatedBy: auth?.id ?? null,
  };

  if (input.minimumRequirements !== undefined || input.recommendedRequirements !== undefined) {
    if (input.minimumRequirements !== undefined && input.recommendedRequirements === undefined) {
      const resolved = resolveRequirements(input.minimumRequirements);
      data.minimumRequirements = jsonValue(resolved.minimumRequirements);
      data.recommendedRequirements = jsonValue(resolved.recommendedRequirements);
    } else {
      if (input.minimumRequirements !== undefined) {
        data.minimumRequirements = input.minimumRequirements as Prisma.InputJsonValue;
      }
      if (input.recommendedRequirements !== undefined) {
        data.recommendedRequirements = input.recommendedRequirements as Prisma.InputJsonValue;
      }
    }
  }

  let bridgeChanged = false;
  if (input.genreIds !== undefined) {
    const current = await prisma.tenantGameGenre.findMany({
      where: { tenantGameId: row.id },
    });
    const currentIds = new Set(current.map((bridge) => bridge.genreId));
    bridgeChanged =
      currentIds.size !== input.genreIds.length ||
      input.genreIds.some((genreId) => !currentIds.has(genreId));
  }
  if (!bridgeChanged && input.platformIds !== undefined) {
    const current = await prisma.gamePlatform.findMany({
      where: { tenantGameId: row.id },
    });
    const currentIds = new Set(current.map((bridge) => bridge.platformId));
    bridgeChanged =
      currentIds.size !== input.platformIds.length ||
      input.platformIds.some((platformId) => !currentIds.has(platformId));
  }

  const priceChanged =
    newPrice === null
      ? row.price !== null
      : row.price === null || Number(newPrice) !== Number(row.price);

  const requirementsChanged =
    ('minimumRequirements' in data &&
      JSON.stringify(data.minimumRequirements) !==
        JSON.stringify(row.minimumRequirements ?? null)) ||
    ('recommendedRequirements' in data &&
      JSON.stringify(data.recommendedRequirements) !==
        JSON.stringify(row.recommendedRequirements ?? null));

  const publicChanged =
    bridgeChanged ||
    (input.title !== undefined && input.title !== row.title) ||
    (input.slug !== undefined && input.slug !== row.slug) ||
    (input.description !== undefined && (input.description ?? null) !== row.description) ||
    (input.availability !== undefined && input.availability !== row.availability) ||
    (input.sizeValue !== undefined && input.sizeValue !== row.sizeValue) ||
    (input.sizeUnit !== undefined && input.sizeUnit !== row.sizeUnit) ||
    (input.releaseYear !== undefined && (input.releaseYear ?? null) !== row.releaseYear) ||
    (input.categoryId !== undefined && (input.categoryId ?? null) !== row.categoryId) ||
    requirementsChanged ||
    newPriceMode !== row.priceMode ||
    priceChanged;

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.tenantGame.update({ where: { id: row.id }, data }),
  ];

  if (input.genreIds !== undefined) {
    ops.push(prisma.tenantGameGenre.deleteMany({ where: { tenantGameId: row.id } }));
    if (input.genreIds.length) {
      ops.push(
        prisma.tenantGameGenre.createMany({
          data: input.genreIds.map((genreId) => ({ tenantGameId: row.id, genreId })),
        }),
      );
    }
  }

  if (input.platformIds !== undefined) {
    ops.push(prisma.gamePlatform.deleteMany({ where: { tenantGameId: row.id } }));
    if (input.platformIds.length) {
      ops.push(
        prisma.gamePlatform.createMany({
          data: input.platformIds.map((platformId) => ({ tenantGameId: row.id, platformId })),
        }),
      );
    }
  }

  ops.push(
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'UPDATE',
        entity: 'TenantGame',
        entityId: row.id,
        tenantId: row.tenantId,
        metadata: { fields: Object.keys(input) },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  );

  if (publicChanged) {
    ops.push((await planCatalogBump(row.tenantId)).op);
  }

  const [updated] = (await prisma.$transaction(ops)) as [TenantGame, ...unknown[]];
  const details = await loadDetails([updated]);
  return tenantGameDto(updated, details.get(updated.id) as GameDetail);
}

export async function deleteGame(id: string, auth: AuthContext | null, meta: RequestMeta) {
  const row = await findRow(id, false);
  assertRowAccess(row, auth);
  const prisma = getPrisma();

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.tenantGame.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), deletedBy: auth?.id ?? null, updatedBy: auth?.id ?? null },
    }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'DELETE',
        entity: 'TenantGame',
        entityId: row.id,
        tenantId: row.tenantId,
        metadata: { title: row.title, slug: row.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ];

  if (row.availability) {
    ops.push((await planCatalogBump(row.tenantId)).op);
  }

  const [deleted] = (await prisma.$transaction(ops)) as [TenantGame, ...unknown[]];

  const details = await loadDetails([deleted]);
  return tenantGameDto(deleted, details.get(deleted.id) as GameDetail);
}

export async function restoreGame(id: string, auth: AuthContext | null, meta: RequestMeta) {
  const row = await findRow(id, true);
  assertRowAccess(row, auth);
  if (!row.deletedAt) {
    throw new AppError(409, 'NOT_DELETED', 'El juego no está eliminado');
  }

  const prisma = getPrisma();
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.tenantGame.update({
      where: { id: row.id },
      data: { deletedAt: null, deletedBy: null, updatedBy: auth?.id ?? null },
    }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'RESTORE',
        entity: 'TenantGame',
        entityId: row.id,
        tenantId: row.tenantId,
        metadata: { title: row.title, slug: row.slug },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ];

  if (row.availability) {
    ops.push((await planCatalogBump(row.tenantId)).op);
  }

  const [restored] = (await prisma.$transaction(ops)) as [TenantGame, ...unknown[]];

  const details = await loadDetails([restored]);
  return tenantGameDto(restored, details.get(restored.id) as GameDetail);
}
