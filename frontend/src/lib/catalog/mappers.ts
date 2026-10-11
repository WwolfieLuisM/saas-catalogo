import type { PublicGame, SizeUnit } from '@/types/catalog';

export interface FeedCard {
  id: string;
  slug: string;
  title: string;
  priceLabel: string;
  hasPrice: boolean;
  currency: 'CUP';
  sizeLabel: string;
  sizeGb: number;
  availability: boolean;
  coverUrl: string | null;
  coverAlt: string;
  screenshots: string[];
  category: string | null;
  genres: string[];
  platforms: string[];
  releaseYear: number | null;
  description: string | null;
}

const UNIT_TO_GB: Record<SizeUnit, number> = {
  MB: 1 / 1024,
  GB: 1,
  TB: 1024,
};

export function sizeToGb(value: number, unit: SizeUnit): number {
  return Math.round(value * UNIT_TO_GB[unit] * 10) / 10;
}

export function formatCup(value: number): string {
  return value.toLocaleString('en-US');
}

export function toFeedCard(game: PublicGame): FeedCard {
  const sizeGb = sizeToGb(game.size.value, game.size.unit);
  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    priceLabel: game.price === null ? 'Consultar' : formatCup(game.price),
    hasPrice: game.price !== null,
    currency: 'CUP',
    sizeLabel: sizeGb > 0 ? `${sizeGb.toLocaleString('en-US')} GB` : '—',
    sizeGb,
    availability: game.availability,
    coverUrl: game.coverImage?.url ?? null,
    coverAlt: game.coverImage?.alt ?? game.title,
    screenshots: game.screenshots.map((shot) => shot.url),
    category: game.category?.name ?? null,
    genres: game.genres.map((genre) => genre.name),
    platforms: game.platforms.map((platform) => platform.name),
    releaseYear: game.releaseYear,
    description: game.description,
  };
}

export function toFeedCards(games: PublicGame[]): FeedCard[] {
  return games.map(toFeedCard);
}
