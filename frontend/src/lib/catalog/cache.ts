import type { CatalogPayload } from '@/types/catalog';

export interface CatalogCacheEntry {
  etag: string | null;
  version: number;
  data: CatalogPayload;
  fetchedAt: number;
}

let entry: CatalogCacheEntry | null = null;

export function getCatalogCache(): CatalogCacheEntry | null {
  return entry;
}

export function setCatalogCache(next: CatalogCacheEntry): void {
  entry = next;
}

export function clearCatalogCache(): void {
  entry = null;
}
