import { adminFetchPaged } from './adminApi';
import type { GameItem, MediaEntry } from './types';

export async function fetchAllGames(tenantId?: string, maxPages = 30): Promise<GameItem[]> {
  const items: GameItem[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await adminFetchPaged<GameItem>('/admin/games', {
      query: { page, limit: 100, sort: 'title', tenantId },
    });
    items.push(...result.data);
    if (page >= result.meta.totalPages || result.data.length === 0) break;
  }
  return items;
}

export async function fetchAllMedia(tenantId?: string, maxPages = 20): Promise<MediaEntry[]> {
  const items: MediaEntry[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await adminFetchPaged<MediaEntry>('/admin/media', {
      query: { page, limit: 100, tenantId },
    });
    items.push(...result.data);
    if (page >= result.meta.totalPages || result.data.length === 0) break;
  }
  return items;
}

export function taxonomyCounts(
  games: GameItem[],
  kind: 'category' | 'genre' | 'platform',
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const game of games) {
    if (kind === 'category') {
      if (game.categoryId) {
        counts[game.categoryId] = (counts[game.categoryId] ?? 0) + 1;
      }
    } else if (kind === 'genre') {
      for (const genre of game.genres) {
        counts[genre.id] = (counts[genre.id] ?? 0) + 1;
      }
    } else {
      for (const platform of game.platforms) {
        counts[platform.id] = (counts[platform.id] ?? 0) + 1;
      }
    }
  }
  return counts;
}
