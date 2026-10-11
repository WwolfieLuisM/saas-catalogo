import type { FeedGame, SortKey, FeedFilters } from '@/types/feed';
import { norm } from './format.ts';

export const SORTS: SortKey[] = ['recent', 'az', 'priceAsc', 'priceDesc', 'sizeAsc'];

export const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Más recientes',
  az: 'A–Z',
  priceAsc: 'Precio ↑',
  priceDesc: 'Precio ↓',
  sizeAsc: 'Tamaño ↑',
};

const comparators: Record<SortKey, (a: FeedGame, b: FeedGame) => number> = {
  recent: (a, b) =>
    (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || (b.year ?? 0) - (a.year ?? 0),
  az: (a, b) => a.name.localeCompare(b.name, 'es'),
  priceAsc: (a, b) => (a.price ?? 0) - (b.price ?? 0),
  priceDesc: (a, b) => (b.price ?? 0) - (a.price ?? 0),
  sizeAsc: (a, b) => a.sizeGb - b.sizeGb,
};

export const filterGames = (
  games: FeedGame[],
  filters: Pick<FeedFilters, 'q' | 'cat' | 'genre' | 'platform' | 'maxPrice' | 'sort'>,
): FeedGame[] => {
  const tokens = norm(filters.q).split(/\s+/).filter(Boolean);
  const max = filters.maxPrice ?? Number.POSITIVE_INFINITY;
  return games
    .filter(
      (g) =>
        (!filters.cat || g.category === filters.cat) &&
        (!filters.genre || g.genres.includes(filters.genre)) &&
        (!filters.platform || g.platforms.includes(filters.platform)) &&
        (g.price ?? 0) <= max &&
        tokens.every((t) => g.searchIndex.includes(t)),
    )
    .sort(comparators[filters.sort]);
};
