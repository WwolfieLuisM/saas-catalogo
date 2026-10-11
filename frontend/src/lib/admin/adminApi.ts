import { ApiError } from '../api/client.ts';
import type { PageMeta, Paged } from './types.ts';
import {
  clearSession,
  defaultStorage,
  isSessionUsable,
  loadSession,
  saveSession,
  sessionFromAuth,
  type AdminSession,
  type AdminUser,
  type AuthPayload,
  type StorageLike,
} from './session.ts';

export const ADMIN_API_BASE = '/api/v1';

const REQUEST_TIMEOUT_MS = 15_000;

export interface AdminApiDeps {
  fetchFn?: typeof fetch;
  storage?: StorageLike | null;
  now?: () => number;
  base?: string;
}

export interface AdminRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function resolve(deps: AdminApiDeps) {
  return {
    fetchFn: deps.fetchFn ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args)),
    storage: deps.storage !== undefined ? deps.storage : defaultStorage(),
    now: deps.now ?? Date.now,
    base: deps.base ?? ADMIN_API_BASE,
  };
}

type Resolved = ReturnType<typeof resolve>;

function buildUrl(base: string, path: string, query?: AdminRequestOptions['query']): string {
  const url = base + path;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function isEnvelope(body: unknown): body is { success: boolean; data: unknown } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    'data' in body
  );
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  let code: string | undefined;
  let message = `HTTP ${res.status}`;
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const err = (body as { error?: { code?: string; message?: string } }).error;
      if (err?.code) code = err.code;
      if (err?.message) message = err.message;
    }
    return new ApiError(message, res.status, code);
  } catch {
    return new ApiError(`HTTP ${res.status}`, res.status);
  }
}

async function readEnvelope<T>(res: Response): Promise<{ data: T; meta?: PageMeta }> {
  if (!res.ok) throw await errorFromResponse(res);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError('Respuesta inesperada (JSON inválido)', res.status, 'BAD_ENVELOPE');
  }
  if (!isEnvelope(body)) {
    throw new ApiError('Respuesta inesperada (falta envelope success/data)', res.status, 'BAD_ENVELOPE');
  }
  const meta =
    'meta' in body && typeof body.meta === 'object' && body.meta !== null
      ? (body.meta as PageMeta)
      : undefined;
  return { data: body.data as T, meta };
}

async function readSuccess<T>(res: Response): Promise<T> {
  return (await readEnvelope<T>(res)).data;
}

function send(
  url: string,
  opts: AdminRequestOptions,
  token: string | null,
  r: Resolved,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.body !== undefined && opts.method !== 'GET') {
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }

  return r.fetchFn(url, {
    method: opts.method ?? 'GET',
    headers,
    body,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export async function login(
  username: string,
  password: string,
  deps: AdminApiDeps = {},
): Promise<AdminSession> {
  const r = resolve(deps);
  const res = await send(
    buildUrl(r.base, '/auth/login'),
    { method: 'POST', body: { username, password } },
    null,
    r,
  );
  const payload = await readSuccess<AuthPayload>(res);
  const session = sessionFromAuth(payload, r.now());
  saveSession(session, r.storage);
  return session;
}

async function doRefresh(deps: AdminApiDeps): Promise<AdminSession> {
  const r = resolve(deps);
  try {
    const res = await send(buildUrl(r.base, '/auth/refresh'), { method: 'POST' }, null, r);
    const payload = await readSuccess<AuthPayload>(res);
    const session = sessionFromAuth(payload, r.now());
    saveSession(session, r.storage);
    return session;
  } catch (error) {
    clearSession(r.storage);
    if (error instanceof ApiError) throw error;
    throw new ApiError('No se pudo renovar la sesión', 401, 'REFRESH_FAILED');
  }
}

let inFlightRefresh: Promise<AdminSession> | null = null;

export function refreshSession(deps: AdminApiDeps = {}): Promise<AdminSession> {
  if (!inFlightRefresh) {
    inFlightRefresh = doRefresh(deps).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export async function logout(deps: AdminApiDeps = {}): Promise<void> {
  const r = resolve(deps);
  clearSession(r.storage);
  try {
    await send(buildUrl(r.base, '/auth/logout'), { method: 'POST' }, null, r);
  } catch {
    return;
  }
}

async function sendAuthed(
  path: string,
  opts: AdminRequestOptions,
  deps: AdminApiDeps,
): Promise<Response> {
  const r = resolve(deps);
  const url = buildUrl(r.base, path, opts.query);

  let session = loadSession(r.storage);
  let refreshed = false;

  if (!isSessionUsable(session, r.now())) {
    session = await refreshSession(deps).catch(() => null);
    refreshed = true;
    if (!isSessionUsable(session, r.now())) {
      clearSession(r.storage);
      throw new ApiError('Sesión expirada', 401, 'UNAUTHENTICATED');
    }
  }

  let res = await send(url, opts, session.accessToken, r);

  if (res.status === 401 && !refreshed) {
    const next = await refreshSession(deps).catch(() => null);
    refreshed = true;
    if (isSessionUsable(next, r.now())) {
      res = await send(url, opts, next.accessToken, r);
    }
  }

  if (res.status === 401) {
    clearSession(r.storage);
    throw await errorFromResponse(res);
  }

  return res;
}

export async function adminFetch<T>(
  path: string,
  opts: AdminRequestOptions = {},
  deps: AdminApiDeps = {},
): Promise<T> {
  const res = await sendAuthed(path, opts, deps);
  return await readSuccess<T>(res);
}

export async function adminFetchPaged<T>(
  path: string,
  opts: AdminRequestOptions = {},
  deps: AdminApiDeps = {},
): Promise<Paged<T>> {
  const res = await sendAuthed(path, opts, deps);
  const envelope = await readEnvelope<T[]>(res);
  if (!envelope.meta) {
    throw new ApiError('Respuesta inesperada (falta meta de paginación)', res.status, 'BAD_ENVELOPE');
  }
  return { data: envelope.data, meta: envelope.meta };
}

export async function adminFetchRaw<T>(
  path: string,
  opts: AdminRequestOptions = {},
  deps: AdminApiDeps = {},
): Promise<{ body: T; filename: string | null }> {
  const res = await sendAuthed(path, opts, deps);
  if (!res.ok) throw await errorFromResponse(res);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    throw new ApiError('Respuesta inesperada (JSON inválido)', res.status, 'BAD_JSON');
  }
  return { body, filename: match?.[1] ?? null };
}

export function me(deps: AdminApiDeps = {}): Promise<AdminUser> {
  return adminFetch<AdminUser>('/auth/me', {}, deps);
}
