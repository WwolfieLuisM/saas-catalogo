export interface TaxonomyRef {
  id: string;
  name: string;
}

export type SizeUnit = 'MB' | 'GB' | 'TB';

export interface GameSize {
  value: number;
  unit: SizeUnit;
  formatted: string;
}

export interface CoverImage {
  url: string;
  alt: string;
}

export interface Screenshot {
  url: string;
}

export interface GameRequirements {
  minimum: unknown;
  recommended: unknown;
}

export interface PublicGame {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number | null;
  currency: 'CUP';
  availability: boolean;
  size: GameSize;
  releaseYear: number | null;
  category: TaxonomyRef | null;
  genres: TaxonomyRef[];
  platforms: TaxonomyRef[];
  coverImage: CoverImage | null;
  screenshots: Screenshot[];
  requirements: GameRequirements;
}

export interface CatalogMeta {
  version: number;
  updatedAt: string | null;
}

export interface CatalogPayload extends CatalogMeta {
  games: PublicGame[];
}

export interface CatalogSyncPayload {
  changed: boolean;
  version: number;
  updatedAt: string | null;
  games?: PublicGame[];
}

export interface TenantPublicSettings {
  publicName: string | null;
  whatsapp: string;
  phone: string;
  email: string;
  logo: string;
  footer: string;
  socialLinks: { label: string; url: string }[];
}

export interface ApiEnvelope<T> {
  success: true;
  data: T;
}
