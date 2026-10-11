import { getCatalog } from '@/lib/api/catalogApi';
import { ApiError } from '@/lib/api/client';
import { getCatalogCache, setCatalogCache } from './cache';
import { demoCatalogPayload } from './demoData';
import type { CatalogPayload } from '@/types/catalog';

export interface LoadResult {
  payload: CatalogPayload;
  stale: boolean;
  fromCache: boolean;
}

export async function loadCatalog(): Promise<LoadResult> {
  if (process.env.NEXT_PUBLIC_DEMO === 'true') {
    return { payload: demoCatalogPayload, stale: false, fromCache: false };
  }

  const cache = getCatalogCache();
  try {
    const res = await getCatalog(cache?.etag ?? null);
    if (res.notModified && cache) {
      return { payload: cache.data, stale: false, fromCache: true };
    }
    if (res.data) {
      setCatalogCache({
        etag: res.etag,
        version: res.data.version,
        data: res.data,
        fetchedAt: Date.now(),
      });
      return { payload: res.data, stale: false, fromCache: false };
    }
    throw new ApiError('Respuesta de catálogo sin datos', 502, 'EMPTY_PAYLOAD');
  } catch (err) {
    if (cache) {
      return { payload: cache.data, stale: true, fromCache: true };
    }
    throw err;
  }
}
