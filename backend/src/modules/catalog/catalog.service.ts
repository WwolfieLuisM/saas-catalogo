import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import {
  Prisma,
  type BaseGame,
  type BaseGamePlatform,
  type Category,
  type GameMedia,
  type Genre,
  type LibraryMedia,
  type Platform,
  type PrismaClient,
  type TenantGame,
} from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';
import { normalizeSocialLinks, type SocialLink } from '../../utils/socialLinks.js';
import { resolveCover, resolveFinal, resolveGenres, resolvePlatformIds } from '../games/resolution.js';
import {
  loadBaseGames,
  loadBaseGenreIds,
  loadLibraryMedia,
  loadVariants,
  variantKey,
} from '../games/resolutionData.js';

interface CatalogMeta {
  version: number;
  updatedAt: Date | null;
}

interface TaxonomyRef {
  id: string;
  name: string;
}

export interface PublicGame {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number | null;
  currency: 'CUP';
  availability: boolean;
  size: { value: number; unit: 'MB' | 'GB' | 'TB'; formatted: string };
  releaseYear: number | null;
  category: TaxonomyRef | null;
  genres: TaxonomyRef[];
  platforms: TaxonomyRef[];
  coverImage: { url: string; alt: string } | null;
  screenshots: { url: string }[];
  requirements: { minimum: unknown; recommended: unknown };
}

interface Snapshot {
  meta: CatalogMeta;
  games: TenantGame[];
  categories: Map<string, Category>;
  genres: Map<string, Genre>;
  platforms: Map<string, Platform>;
  genreIdsByGame: Map<string, string[]>;
  platformIdsByGame: Map<string, string[]>;
  mediaByGame: Map<string, GameMedia[]>;
  baseGameById: Map<string, BaseGame>;
  variantByKey: Map<string, BaseGamePlatform>;
  baseGenreIdsByBase: Map<string, string[]>;
  libraryMediaByBase: Map<string, LibraryMedia[]>;
}

export async function resolvePublicTenant(slug: string): Promise<string> {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || !tenant.isActive) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Catálogo no encontrado');
  }
  return tenant.id;
}

export interface PublicTenantSettings {
  publicName: string | null;
  whatsapp: string;
  phone: string;
  email: string;
  logo: string;
  footer: string;
  socialLinks: SocialLink[];
}

export async function getPublicSettings(slug: string): Promise<PublicTenantSettings> {
  const tenantId = await resolvePublicTenant(slug);
  const row = await getPrisma().tenantSettings.findUnique({ where: { tenantId } });
  return {
    publicName: row?.publicName ?? null,
    whatsapp: row?.whatsapp ?? '',
    phone: row?.phone ?? '',
    email: row?.email ?? '',
    logo: row?.logo ?? '',
    footer: row?.footer ?? '',
    socialLinks: normalizeSocialLinks(row?.socialLinks),
  };
}

async function readMeta(tenantId: string): Promise<CatalogMeta> {
  const prisma = getPrisma();
  const row = await prisma.catalogMetadata.findFirst({ where: { tenantId } });
  return { version: row?.version ?? 0, updatedAt: row?.updatedAt ?? null };
}

async function readSnapshot(tenantId: string): Promise<Snapshot> {
  const prisma = getPrisma();

  return prisma.$transaction(
    async (tx) => {
      const settings = await tx.tenantSettings.findUnique({ where: { tenantId } });
      const showUnavailable = settings?.showUnavailable ?? false;

      const [metaRow, games, media] = await Promise.all([
        tx.catalogMetadata.findFirst({ where: { tenantId } }),
        tx.tenantGame.findMany({
          where: {
            tenantId,
            ...(showUnavailable ? {} : { availability: true }),
            deletedAt: null,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        tx.gameMedia.findMany({ where: { tenantId, status: 'OK' } }),
      ]);

      const gameIds = games.map((game) => game.id);
      const baseGameIds = [
        ...new Set(
          games
            .map((game) => game.baseGameId)
            .filter((baseGameId): baseGameId is string => baseGameId !== null),
        ),
      ];

      const [baseGameById, variantByKey, baseGenreIdsByBase, libraryMediaByBase] =
        await Promise.all([
          loadBaseGames(tx, baseGameIds),
          loadVariants(tx, baseGameIds),
          loadBaseGenreIds(tx, baseGameIds),
          loadLibraryMedia(tx, baseGameIds),
        ]);

      let genreBridges: { tenantGameId: string; genreId: string }[] = [];
      let platformBridges: { tenantGameId: string; platformId: string }[] = [];
      if (gameIds.length) {
        [genreBridges, platformBridges] = await Promise.all([
          tx.tenantGameGenre.findMany({
            where: { tenantGameId: { in: gameIds } },
            orderBy: { genreId: 'asc' },
          }),
          tx.gamePlatform.findMany({
            where: { tenantGameId: { in: gameIds } },
            orderBy: { platformId: 'asc' },
          }),
        ]);
      }

      const genreIdsByGame = new Map<string, string[]>();
      for (const bridge of genreBridges) {
        const list = genreIdsByGame.get(bridge.tenantGameId) ?? [];
        list.push(bridge.genreId);
        genreIdsByGame.set(bridge.tenantGameId, list);
      }

      const platformIdsByGame = new Map<string, string[]>();
      for (const bridge of platformBridges) {
        const list = platformIdsByGame.get(bridge.tenantGameId) ?? [];
        list.push(bridge.platformId);
        platformIdsByGame.set(bridge.tenantGameId, list);
      }

      const categoryIds = new Set<string>();
      const genreIds = new Set<string>();
      const platformIds = new Set<string>();

      for (const game of games) {
        const base = game.baseGameId ? baseGameById.get(game.baseGameId) : undefined;
        const variant =
          game.baseGameId && game.platformId
            ? variantByKey.get(variantKey(game.baseGameId, game.platformId))
            : undefined;

        const finalCategoryId = resolveFinal(game, variant, base, 'categoryId');
        if (finalCategoryId) categoryIds.add(finalCategoryId);

        for (const genreId of resolveGenres(
          genreIdsByGame.get(game.id) ?? [],
          game.baseGameId ? baseGenreIdsByBase.get(game.baseGameId) ?? [] : [],
          game.clearedFields,
        )) {
          genreIds.add(genreId);
        }

        for (const platformId of resolvePlatformIds(
          game.platformId,
          platformIdsByGame.get(game.id) ?? [],
        )) {
          platformIds.add(platformId);
        }
      }

      const [categories, genres, platforms] = await Promise.all([
        categoryIds.size
          ? tx.category.findMany({ where: { id: { in: [...categoryIds] }, deletedAt: null } })
          : Promise.resolve([]),
        genreIds.size
          ? tx.genre.findMany({ where: { id: { in: [...genreIds] }, deletedAt: null } })
          : Promise.resolve([]),
        platformIds.size
          ? tx.platform.findMany({ where: { id: { in: [...platformIds] }, deletedAt: null } })
          : Promise.resolve([]),
      ]);

      const mediaByGame = new Map<string, GameMedia[]>();
      for (const row of media) {
        const list = mediaByGame.get(row.gameId) ?? [];
        list.push(row);
        mediaByGame.set(row.gameId, list);
      }

      return {
        meta: { version: metaRow?.version ?? 0, updatedAt: metaRow?.updatedAt ?? null },
        games,
        categories: new Map(categories.map((row) => [row.id, row])),
        genres: new Map(genres.map((row) => [row.id, row])),
        platforms: new Map(platforms.map((row) => [row.id, row])),
        genreIdsByGame,
        platformIdsByGame,
        mediaByGame,
        baseGameById,
        variantByKey,
        baseGenreIdsByBase,
        libraryMediaByBase,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

function refsFor(ids: string[], source: Map<string, { id: string; name: string }>): TaxonomyRef[] {
  const refs: TaxonomyRef[] = [];
  for (const id of ids) {
    const row = source.get(id);
    if (row) {
      refs.push({ id: row.id, name: row.name });
    }
  }
  return refs;
}

function publicGameDto(row: TenantGame, snapshot: Snapshot): PublicGame {
  const base = row.baseGameId ? snapshot.baseGameById.get(row.baseGameId) : undefined;
  const variant =
    row.baseGameId && row.platformId
      ? snapshot.variantByKey.get(variantKey(row.baseGameId, row.platformId))
      : undefined;

  const finalTitle = resolveFinal(row, variant, base, 'title');
  const finalDescription = resolveFinal(row, variant, base, 'description');
  const sizeValue = resolveFinal(row, variant, base, 'sizeValue');
  const sizeUnit = resolveFinal(row, variant, base, 'sizeUnit');
  const finalReleaseYear = resolveFinal(row, variant, base, 'releaseYear');
  const finalCategoryId = resolveFinal(row, variant, base, 'categoryId');
  const minimum = resolveFinal(row, variant, base, 'minimumRequirements');
  const recommended = resolveFinal(row, variant, base, 'recommendedRequirements');

  const title = finalTitle ?? row.slug;
  const media = snapshot.mediaByGame.get(row.id) ?? [];
  const libraryMedia = row.baseGameId
    ? snapshot.libraryMediaByBase.get(row.baseGameId) ?? []
    : [];
  const cover = resolveCover(media, libraryMedia, row.clearedFields);
  const screenshots = media
    .filter((item) => item.kind === 'SHOT' && item.url !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const categoryRow = finalCategoryId ? snapshot.categories.get(finalCategoryId) : undefined;

  const genreIds = resolveGenres(
    snapshot.genreIdsByGame.get(row.id) ?? [],
    row.baseGameId ? snapshot.baseGenreIdsByBase.get(row.baseGameId) ?? [] : [],
    row.clearedFields,
  );
  const platformIds = resolvePlatformIds(
    row.platformId,
    snapshot.platformIdsByGame.get(row.id) ?? [],
  );

  return {
    id: row.id,
    title,
    slug: row.slug,
    description: finalDescription,
    price: row.price === null ? null : Number(row.price),
    currency: 'CUP',
    availability: row.availability,
    size:
      sizeValue !== null && (sizeUnit === 'MB' || sizeUnit === 'GB' || sizeUnit === 'TB')
        ? { value: sizeValue, unit: sizeUnit, formatted: `${sizeValue} ${sizeUnit}` }
        : { value: 0, unit: 'GB', formatted: '0 GB' },
    releaseYear: finalReleaseYear,
    category: categoryRow ? { id: categoryRow.id, name: categoryRow.name } : null,
    genres: refsFor(genreIds, snapshot.genres),
    platforms: refsFor(platformIds, snapshot.platforms),
    coverImage: cover?.url ? { url: cover.url, alt: title } : null,
    screenshots: screenshots.map((item) => ({ url: item.url as string })),
    requirements: {
      minimum: minimum ?? {},
      recommended: recommended ?? {},
    },
  };
}

function gamesOf(snapshot: Snapshot): PublicGame[] {
  return snapshot.games.map((row) => publicGameDto(row, snapshot));
}

export async function getCatalogVersion(slug: string): Promise<CatalogMeta> {
  const tenantId = await resolvePublicTenant(slug);
  return readMeta(tenantId);
}

export async function getCatalog(slug: string) {
  const tenantId = await resolvePublicTenant(slug);
  const snapshot = await readSnapshot(tenantId);
  return {
    version: snapshot.meta.version,
    updatedAt: snapshot.meta.updatedAt,
    games: gamesOf(snapshot),
  };
}

export async function getCatalogSync(slug: string, since: number | undefined) {
  const tenantId = await resolvePublicTenant(slug);
  const meta = await readMeta(tenantId);

  if (since !== undefined && since === meta.version) {
    return { changed: false, version: meta.version, updatedAt: meta.updatedAt };
  }

  const snapshot = await readSnapshot(tenantId);
  return {
    changed: true,
    version: snapshot.meta.version,
    updatedAt: snapshot.meta.updatedAt,
    games: gamesOf(snapshot),
  };
}

export interface CatalogBumpOp {
  op: Prisma.PrismaPromise<unknown>;
}

export async function planCatalogBump(
  tenantId: string,
  client: PrismaClient | Prisma.TransactionClient = getPrisma(),
): Promise<CatalogBumpOp> {
  return {
    op: client.catalogMetadata.upsert({
      where: { tenantId },
      update: { version: { increment: 1 } },
      create: { id: randomUUID(), tenantId, version: 1 },
    }),
  };
}
