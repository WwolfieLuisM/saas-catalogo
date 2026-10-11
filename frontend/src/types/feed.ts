import type { GameRequirements } from './catalog';

export type GameStatus = 'pending' | 'played' | 'won';

export interface FeedGame {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  genres: string[];
  platforms: string[];
  sizeGb: number;
  year: number | null;
  price: number | null;
  available: boolean;
  cover: string | null;
  banner: string | null;
  screenshots: string[];
  description: string | null;
  requirements: GameRequirements;
  minRequirements: string;
  recommendedRequirements: string;
  addedAt: string | null;
  soon: boolean;
  releaseDate: string | null;
  hue: number;
  searchIndex: string;
}

export interface FeedCatalog {
  catalogVersion: number;
  updatedAt: string | null;
  games: FeedGame[];
}

export type SortKey = 'recent' | 'az' | 'priceAsc' | 'priceDesc' | 'sizeAsc';

export interface FacetEntry {
  value: string;
  label: string;
  count: number;
}

export interface FeedFacets {
  cats: FacetEntry[];
  genres: FacetEntry[];
  platforms: FacetEntry[];
  maxPriceAll: number;
}

export interface FeedFilters {
  q: string;
  cat: string;
  genre: string;
  platform: string;
  maxPrice: number | null;
  sort: SortKey;
}

export type CollectionFilter = 'all' | 'favorites' | 'pending' | 'played' | 'won';
