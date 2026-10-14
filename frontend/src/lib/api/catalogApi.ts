import { fetchEnvelope, type FetchResult } from './client';
import type {
  CatalogMeta,
  CatalogPayload,
  CatalogSyncPayload,
  TenantPublicSettings,
} from '@/types/catalog';

export async function getCatalog(
  etag?: string | null,
): Promise<FetchResult<CatalogPayload>> {
  return fetchEnvelope<CatalogPayload>('/api/v1/catalog', { etag });
}

export async function getCatalogVersion(
  etag?: string | null,
): Promise<FetchResult<CatalogMeta>> {
  return fetchEnvelope<CatalogMeta>('/api/v1/catalog/version', { etag });
}

export async function getCatalogSync(
  since: number | undefined,
): Promise<FetchResult<CatalogSyncPayload>> {
  return fetchEnvelope<CatalogSyncPayload>('/api/v1/catalog/sync', {
    query: since === undefined ? {} : { since: String(since) },
  });
}

export async function getTenantSettings(): Promise<FetchResult<TenantPublicSettings>> {
  return fetchEnvelope<TenantPublicSettings>('/api/v1/catalog/settings');
}
