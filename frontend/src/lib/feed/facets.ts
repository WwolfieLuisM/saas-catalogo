import type { FeedGame, FeedFacets, FacetEntry } from '@/types/feed';

const countBy = (games: FeedGame[], fn: (g: FeedGame) => string[]): FacetEntry[] => {
  const m = new Map<string, number>();
  for (const g of games) {
    for (const v of fn(g)) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'es'));
};

export const buildFacets = (games: FeedGame[]): FeedFacets => {
  const cats = countBy(games, (g) => (g.category ? [g.category] : []));
  const genres = countBy(games, (g) => g.genres);
  const platforms = countBy(games, (g) => g.platforms);
  const top = Math.max(500, ...games.map((g) => g.price ?? 0));
  const maxPriceAll = Math.ceil(top / 500) * 500;
  return { cats, genres, platforms, maxPriceAll };
};
