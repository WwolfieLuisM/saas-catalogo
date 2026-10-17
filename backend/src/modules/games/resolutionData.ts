import type {
  BaseGame,
  BaseGamePlatform,
  LibraryMedia,
  Prisma,
  PrismaClient,
} from '../../generated/client.js';

type Db = Prisma.TransactionClient | PrismaClient;

export function variantKey(baseGameId: string, platformId: string): string {
  return `${baseGameId}:${platformId}`;
}

export async function loadBaseGames(db: Db, ids: string[]): Promise<Map<string, BaseGame>> {
  if (!ids.length) return new Map();
  const rows = await db.baseGame.findMany({
    where: { id: { in: ids }, deletedAt: null },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

export async function loadVariants(
  db: Db,
  baseGameIds: string[],
): Promise<Map<string, BaseGamePlatform>> {
  if (!baseGameIds.length) return new Map();
  const rows = await db.baseGamePlatform.findMany({
    where: { baseGameId: { in: baseGameIds } },
  });
  return new Map(rows.map((row) => [variantKey(row.baseGameId, row.platformId), row]));
}

export async function loadBaseGenreIds(
  db: Db,
  baseGameIds: string[],
): Promise<Map<string, string[]>> {
  if (!baseGameIds.length) return new Map();
  const rows = await db.baseGameGenre.findMany({
    where: { baseGameId: { in: baseGameIds } },
    orderBy: { genreId: 'asc' },
  });
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.baseGameId) ?? [];
    list.push(row.genreId);
    map.set(row.baseGameId, list);
  }
  return map;
}

export async function loadLibraryMedia(
  db: Db,
  baseGameIds: string[],
): Promise<Map<string, LibraryMedia[]>> {
  if (!baseGameIds.length) return new Map();
  const rows = await db.libraryMedia.findMany({
    where: { baseGameId: { in: baseGameIds }, status: 'OK' },
    orderBy: { sortOrder: 'asc' },
  });
  const map = new Map<string, LibraryMedia[]>();
  for (const row of rows) {
    const list = map.get(row.baseGameId) ?? [];
    list.push(row);
    map.set(row.baseGameId, list);
  }
  return map;
}
