import type { GameStatus } from '@/types/feed';

const LIST_KEY = 'javierpc:list';
const FAVORITES_KEY = 'javierpc:favorites';
const STATUS_KEY = 'javierpc:game-status';
const WELCOME_KEY = 'javierpc:welcome-seen';
const FAB_KEY = 'javierpc:fab-pos';
const CATALOG_KEY = 'javierpc:catalog';
const SCHEMA_VERSION = 1;

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
};

export const loadListIds = (): string[] => readJson<string[]>(LIST_KEY, []).map(String);
export const saveListIds = (ids: string[]): void => writeJson(LIST_KEY, [...ids]);

export const loadFavoriteIds = (): string[] => readJson<string[]>(FAVORITES_KEY, []).map(String);
export const saveFavoriteIds = (ids: string[]): void => writeJson(FAVORITES_KEY, [...ids]);

export const loadStatusMap = (): Record<string, GameStatus> => {
  const raw = readJson<Record<string, string>>(STATUS_KEY, {});
  const out: Record<string, GameStatus> = {};
  for (const [id, status] of Object.entries(raw)) {
    if (status === 'pending' || status === 'played' || status === 'won') out[id] = status;
  }
  return out;
};
export const saveStatusMap = (map: Record<string, GameStatus>): void =>
  writeJson(STATUS_KEY, map);

export const hasSeenWelcome = (): boolean => {
  try {
    return Boolean(localStorage.getItem(WELCOME_KEY));
  } catch {
    return true;
  }
};
export const markWelcomeSeen = (): void => {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    /* ignore */
  }
};

export const loadFabPos = (): { x: number; y: number } | null => {
  const p = readJson<{ x: number; y: number } | null>(FAB_KEY, null);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { x: p.x, y: p.y };
};
export const saveFabPos = (pos: { x: number; y: number }): void =>
  writeJson(FAB_KEY, { x: Math.round(pos.x), y: Math.round(pos.y) });

export interface CatalogCacheEntry {
  schemaVersion: number;
  catalogVersion: number;
  updatedAt: string | null;
  cachedAt: string;
  expiresAt: string;
  data: { games: unknown[] };
}

export const readCatalogCache = (): CatalogCacheEntry | null => {
  const c = readJson<CatalogCacheEntry | null>(CATALOG_KEY, null);
  if (
    !c ||
    c.schemaVersion !== SCHEMA_VERSION ||
    !Number.isFinite(c.catalogVersion) ||
    !c.data ||
    !Array.isArray(c.data.games)
  ) {
    try {
      localStorage.removeItem(CATALOG_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  return c;
};

export const writeCatalogCache = (
  catalogVersion: number,
  updatedAt: string | null,
  games: unknown[],
): string => {
  const now = Date.now();
  const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const entry: CatalogCacheEntry = {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion,
    updatedAt,
    cachedAt: new Date(now).toISOString(),
    expiresAt,
    data: { games },
  };
  writeJson(CATALOG_KEY, entry);
  return expiresAt;
};

export const isCacheExpired = (entry: CatalogCacheEntry): boolean =>
  Boolean(entry.expiresAt && Date.now() > Date.parse(entry.expiresAt));
