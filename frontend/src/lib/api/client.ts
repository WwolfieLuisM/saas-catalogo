import type { ApiEnvelope } from '@/types/catalog';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface FetchResult<T> {
  data: T | null;
  notModified: boolean;
  etag: string | null;
}

export interface RequestOptions {
  baseUrl?: string;
  tenant?: string;
  etag?: string | null;
  query?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;

export function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new ApiError('NEXT_PUBLIC_API_URL no configurada', 0, 'CONFIG_MISSING');
  }
  return url.replace(/\/+$/, '');
}

export function tenantSlug(): string {
  const slug = process.env.NEXT_PUBLIC_TENANT_SLUG;
  if (!slug) {
    throw new ApiError('NEXT_PUBLIC_TENANT_SLUG no configurado', 0, 'CONFIG_MISSING');
  }
  return slug;
}

function isEnvelope<T>(body: unknown): body is ApiEnvelope<T> {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    'data' in body
  );
}

export async function fetchEnvelope<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<FetchResult<T>> {
  const base = (opts.baseUrl ?? apiBaseUrl()).replace(/\/+$/, '');
  const url = new URL(base + path);
  url.searchParams.set('tenant', opts.tenant ?? tenantSlug());
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.etag) {
    headers['If-None-Match'] = opts.etag;
  }

  const res = await fetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (res.status === 304) {
    return { data: null, notModified: true, etag: opts.etag ?? null };
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `HTTP ${res.status}`;
    try {
      const body: unknown = await res.json();
      if (typeof body === 'object' && body !== null && 'error' in body) {
        const err = (body as { error?: { code?: string; message?: string } }).error;
        if (err?.code) code = err.code;
        if (err?.message) message = err.message;
      }
    } catch {
      // cuerpo no JSON: conservar mensaje HTTP
    }
    throw new ApiError(message, res.status, code);
  }

  const body: unknown = await res.json();
  if (!isEnvelope<T>(body)) {
    throw new ApiError('Respuesta inesperada (falta envelope success/data)', res.status, 'BAD_ENVELOPE');
  }
  return { data: body.data, notModified: false, etag: res.headers.get('etag') };
}
