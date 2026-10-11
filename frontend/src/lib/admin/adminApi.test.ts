import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/client.ts';
import { adminFetch, adminFetchPaged, adminFetchRaw, login, logout, refreshSession } from './adminApi.ts';
import {
  EXPIRY_SKEW_MS,
  SESSION_STORAGE_KEY,
  isSessionUsable,
  loadSession,
  parseSession,
  sessionFromAuth,
  type StorageLike,
} from './session.ts';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RecordedCall {
  url: string;
  init: RequestInit;
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function makeFetch(handlers: Array<[RegExp, Handler]>): {
  fetchFn: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [pattern, handler] of handlers) {
      if (pattern.test(url)) return handler(url, init);
    }
    return jsonResponse({ success: false, error: { code: 'NOT_MOCKED', message: url } }, 500);
  }) as typeof fetch;
  return { fetchFn, calls };
}

function authHeader(init: RequestInit): string | null {
  return new Headers(init.headers).get('Authorization');
}

const NOW = 1_700_000_000_000;
const user = { id: 'u1', username: 'javier', role: 'ADMIN' as const, tenantId: 't1' };

function seedSession(
  storage: StorageLike,
  token = 'tok-1',
  expiresAt = NOW + 3_600_000,
): void {
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: token, expiresAt, user }));
}

test('sessionFromAuth calcula expiresAt y parseSession valida la forma', () => {
  const s = sessionFromAuth({ accessToken: 'a', expiresIn: 60, user }, NOW);
  assert.equal(s.expiresAt, NOW + 60_000);

  const raw = JSON.stringify(s);
  assert.deepEqual(parseSession(raw), s);

  assert.equal(parseSession(null), null);
  assert.equal(parseSession('no-json'), null);
  assert.equal(parseSession(JSON.stringify({ accessToken: '', expiresAt: 1, user })), null);
  assert.equal(
    parseSession(JSON.stringify({ accessToken: 'a', expiresAt: 1, user: { id: '', username: 'x', role: 'ADMIN', tenantId: null } })),
    null,
  );
  assert.equal(
    parseSession(JSON.stringify({ accessToken: 'a', expiresAt: NOW, user: { ...user, role: 'OTRO' } })),
    null,
  );
});

test('isSessionUsable respeta expiración y skew', () => {
  const s = sessionFromAuth({ accessToken: 'a', expiresIn: 60, user }, NOW);
  assert.equal(isSessionUsable(s, NOW), true);
  assert.equal(isSessionUsable(s, NOW + 60_000), false);
  assert.equal(isSessionUsable(s, NOW + 60_000 - EXPIRY_SKEW_MS + 1), false);
  assert.equal(isSessionUsable(null, NOW), false);
});

test('login envía credenciales, guarda la sesión y propaga errores del backend', async () => {
  const storage = fakeStorage();
  const ok = makeFetch([
    [
      /\/auth\/login$/,
      () =>
        jsonResponse({
          success: true,
          data: { accessToken: 'a1', expiresIn: 60, user },
        }),
    ],
  ]);

  const session = await login('javier', 'secret123', {
    fetchFn: ok.fetchFn,
    storage,
    now: () => NOW,
  });
  assert.equal(session.accessToken, 'a1');
  assert.equal(session.expiresAt, NOW + 60_000);
  assert.deepEqual(loadSession(storage), session);

  assert.equal(ok.calls[0].url, '/api/v1/auth/login');
  assert.deepEqual(JSON.parse(String(ok.calls[0].init.body)), {
    username: 'javier',
    password: 'secret123',
  });

  const bad = makeFetch([[/.*/, () => jsonResponse(
    { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } },
    401,
  )]]);
  await assert.rejects(
    () => login('javier', 'mala', { fetchFn: bad.fetchFn, storage, now: () => NOW }),
    (err: unknown) => err instanceof ApiError && err.status === 401 && err.code === 'INVALID_CREDENTIALS',
  );
});

test('adminFetch envía Bearer, añade query y unwrap el envelope', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-1');
  const { fetchFn, calls } = makeFetch([
    [/\/admin\/dashboard/, () => jsonResponse({ success: true, data: { totalGames: 5 } })],
  ]);

  const data = await adminFetch<{ totalGames: number }>('/admin/dashboard', { query: { page: 2 } }, {
    fetchFn,
    storage,
    now: () => NOW,
  });

  assert.deepEqual(data, { totalGames: 5 });
  assert.equal(calls[0].url, '/api/v1/admin/dashboard?page=2');
  assert.equal(authHeader(calls[0].init), 'Bearer tok-1');
});

test('ante 401 renueva la sesión y repite la petición una vez', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-old');
  let gamesCalls = 0;
  const { fetchFn, calls } = makeFetch([
    [
      /\/admin\/games/,
      () => {
        gamesCalls += 1;
        return gamesCalls === 1
          ? jsonResponse({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'vencido' } }, 401)
          : jsonResponse({ success: true, data: [{ id: 'g1' }] });
      },
    ],
    [
      /\/auth\/refresh$/,
      () => jsonResponse({ success: true, data: { accessToken: 'tok-new', expiresIn: 60, user } }),
    ],
  ]);

  const data = await adminFetch<{ id: string }[]>('/admin/games', {}, {
    fetchFn,
    storage,
    now: () => NOW,
  });

  assert.deepEqual(data, [{ id: 'g1' }]);
  const refreshCalls = calls.filter((c) => c.url.includes('/auth/refresh'));
  assert.equal(refreshCalls.length, 1);
  assert.equal(authHeader(calls[calls.length - 1].init), 'Bearer tok-new');
  assert.equal(loadSession(storage)?.accessToken, 'tok-new');
});

test('si el refresh falla limpia la sesión y lanza 401', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-old');
  const { fetchFn } = makeFetch([
    [/\/admin\/games/, () => jsonResponse({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'vencido' } }, 401)],
    [/\/auth\/refresh$/, () => jsonResponse({ success: false, error: { code: 'REFRESH_INVALID', message: 'inválida' } }, 401)],
  ]);

  await assert.rejects(
    () => adminFetch('/admin/games', {}, { fetchFn, storage, now: () => NOW }),
    (err: unknown) => err instanceof ApiError && err.status === 401,
  );
  assert.equal(loadSession(storage), null);
});

test('no entra en bucle: tras un segundo 401 lanza sin reintentar el refresh otra vez', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-old');
  const { fetchFn, calls } = makeFetch([
    [/\/admin\/games/, () => jsonResponse({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'vencido' } }, 401)],
    [
      /\/auth\/refresh$/,
      () => jsonResponse({ success: true, data: { accessToken: 'tok-new', expiresIn: 60, user } }),
    ],
  ]);

  await assert.rejects(
    () => adminFetch('/admin/games', {}, { fetchFn, storage, now: () => NOW }),
    (err: unknown) => err instanceof ApiError && err.status === 401,
  );
  assert.equal(calls.filter((c) => c.url.includes('/auth/refresh')).length, 1);
  assert.equal(loadSession(storage), null);
});

test('con sesión vencida renueva antes de hacer la petición autenticada', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-expired', NOW - 1000);
  const { fetchFn, calls } = makeFetch([
    [/\/auth\/refresh$/, () => jsonResponse({ success: true, data: { accessToken: 'tok-fresh', expiresIn: 60, user } })],
    [/\/admin\/games/, () => jsonResponse({ success: true, data: [] })],
  ]);

  await adminFetch<unknown[]>('/admin/games', {}, { fetchFn, storage, now: () => NOW });

  const authed = calls.filter((c) => c.url.includes('/admin\/games'));
  assert.equal(authed.length, 1);
  assert.equal(authHeader(authed[0].init), 'Bearer tok-fresh');
  assert.equal(calls[0].url.includes('/auth/refresh'), true);
});

test('adminFetchPaged devuelve data y meta de paginación', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-1');
  const meta = { page: 2, pageSize: 20, total: 41, totalPages: 3 };
  const { fetchFn, calls } = makeFetch([
    [
      /\/admin\/categorias/,
      () => jsonResponse({ success: true, data: [{ id: 'c1', name: 'Acción' }], meta }),
    ],
  ]);

  const paged = await adminFetchPaged<{ id: string; name: string }>(
    '/admin/categorias',
    { query: { page: 2, limit: 20, q: 'ac' } },
    { fetchFn, storage, now: () => NOW },
  );

  assert.deepEqual(paged.data, [{ id: 'c1', name: 'Acción' }]);
  assert.deepEqual(paged.meta, meta);
  assert.equal(calls[0].url, '/api/v1/admin/categorias?page=2&limit=20&q=ac');
});

test('adminFetchPaged lanza BAD_ENVELOPE si la respuesta no trae meta', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-1');
  const { fetchFn } = makeFetch([
    [/\/admin\/categorias/, () => jsonResponse({ success: true, data: [] })],
  ]);

  await assert.rejects(
    () => adminFetchPaged('/admin/categorias', {}, { fetchFn, storage, now: () => NOW }),
    (err: unknown) => err instanceof ApiError && err.code === 'BAD_ENVELOPE',
  );
});

test('logout limpia la sesión local aunque el request falle', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-1');
  const failing = (async () => {
    throw new Error('red caída');
  }) as unknown as typeof fetch;

  await logout({ fetchFn: failing, storage });
  assert.equal(loadSession(storage), null);
});

test('adminFetchRaw devuelve el body plano y el filename del Content-Disposition', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-1');
  const { fetchFn, calls } = makeFetch([
    [
      /\/admin\/export\/catalog/,
      () =>
        new Response(JSON.stringify({ schema: 'catalog-export', games: [] }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="catalogo-javier.json"',
          },
        }),
    ],
  ]);

  const result = await adminFetchRaw<{ schema: string }>('/admin/export/catalog', {}, {
    fetchFn,
    storage,
    now: () => NOW,
  });

  assert.equal(result.filename, 'catalogo-javier.json');
  assert.equal(result.body.schema, 'catalog-export');
  assert.equal(calls[0].url, '/api/v1/admin/export/catalog');
});

test('adminFetchRaw propaga errores del backend', async () => {
  const storage = fakeStorage();
  seedSession(storage, 'tok-1');
  const { fetchFn } = makeFetch([
    [
      /\/admin\/export\/catalog/,
      () => jsonResponse(
        { success: false, error: { code: 'FORBIDDEN', message: 'Denegado' } },
        403,
      ),
    ],
  ]);

  await assert.rejects(
    () => adminFetchRaw('/admin/export/catalog', {}, { fetchFn, storage, now: () => NOW }),
    (err: unknown) => err instanceof ApiError && err.status === 403 && err.code === 'FORBIDDEN',
  );
});

test('refreshSession reutiliza la petición en vuelo (single-flight)', async () => {
  const storage = fakeStorage();
  let refreshHits = 0;
  const slowFetch = (async () => {
    refreshHits += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return jsonResponse({ success: true, data: { accessToken: 'tok-x', expiresIn: 60, user } });
  }) as typeof fetch;

  const [a, b] = await Promise.all([
    refreshSession({ fetchFn: slowFetch, storage, now: () => NOW }),
    refreshSession({ fetchFn: slowFetch, storage, now: () => NOW }),
  ]);

  assert.equal(refreshHits, 1);
  assert.equal(a.accessToken, 'tok-x');
  assert.equal(b.accessToken, 'tok-x');
});
