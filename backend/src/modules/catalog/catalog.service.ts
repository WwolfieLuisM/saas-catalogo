import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import {
  Prisma,
  type Category,
  type GameMedia,
  type Genre,
  type Platform,
  type PrismaClient,
  type TenantGame,
} from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';

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
}

export async function resolvePublicTenant(slug: string): Promise<string> {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || !tenant.isActive) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Catálogo no encontrado');
  }
  return tenant.id;
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

      const categoryIds = [
        ...new Set(
          games
            .map((game) => game.categoryId)
            .filter((categoryId): categoryId is string => categoryId !== null),
        ),
      ];
      const genreIds = [...new Set(genreBridges.map((bridge) => bridge.genreId))];
      const platformIds = [...new Set(platformBridges.map((bridge) => bridge.platformId))];

      const [categories, genres, platforms] = await Promise.all([
        categoryIds.length
          ? tx.category.findMany({ where: { id: { in: categoryIds }, deletedAt: null } })
          : Promise.resolve([]),
        genreIds.length
          ? tx.genre.findMany({ where: { id: { in: genreIds }, deletedAt: null } })
          : Promise.resolve([]),
        platformIds.length
          ? tx.platform.findMany({ where: { id: { in: platformIds }, deletedAt: null } })
          : Promise.resolve([]),
      ]);

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
  const media = snapshot.mediaByGame.get(row.id) ?? [];
  const cover = media.find((item) => item.kind === 'COVER' && item.url !== null) ?? null;
  const screenshots = media
    .filter((item) => item.kind === 'SHOT' && item.url !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const categoryRow = row.categoryId ? snapshot.categories.get(row.categoryId) : undefined;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    price: row.price === null ? null : Number(row.price),
    currency: 'CUP',
    availability: row.availability,
    size: {
      value: row.sizeValue,
      unit: row.sizeUnit,
      formatted: `${row.sizeValue} ${row.sizeUnit}`,
    },
    releaseYear: row.releaseYear,
    category: categoryRow ? { id: categoryRow.id, name: categoryRow.name } : null,
    genres: refsFor(snapshot.genreIdsByGame.get(row.id) ?? [], snapshot.genres),
    platforms: refsFor(snapshot.platformIdsByGame.get(row.id) ?? [], snapshot.platforms),
    coverImage: cover?.url ? { url: cover.url, alt: row.title } : null,
    screenshots: screenshots.map((item) => ({ url: item.url as string })),
    requirements: {
      minimum: row.minimumRequirements ?? {},
      recommended: row.recommendedRequirements ?? {},
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
  const existing = await client.catalogMetadata.findFirst({ where: { tenantId } });

  if (existing) {
    return {
      op: client.catalogMetadata.update({
        where: { id: existing.id },
        data: { version: existing.version + 1 },
      }),
    };
  }

  return {
    op: client.catalogMetadata.create({
      data: { id: randomUUID(), tenantId, version: 1 },
    }),
  };
}
