import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, apiBaseUrl, fetchEnvelope, tenantSlug } from './client.ts';

const originalEnv = { ...process.env };

function setEnv(): void {
  process.env.NEXT_PUBLIC_API_URL = 'https://api.test/';
  process.env.NEXT_PUBLIC_TENANT_SLUG = 'javier';
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

test.afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = globalThis.fetch;
});

test('apiBaseUrl y tenantSlug leen env y recortan barras', () => {
  setEnv();
  assert.equal(apiBaseUrl(), 'https://api.test');
  assert.equal(tenantSlug(), 'javier');
});

test('apiBaseUrl lanza ApiError si falta la env', () => {
  delete process.env.NEXT_PUBLIC_API_URL;
  assert.throws(() => apiBaseUrl(), (err: unknown) => err instanceof ApiError && err.code === 'CONFIG_MISSING');
});

test('fetchEnvelope unwrap {success,data} y expone etag', async () => {
  setEnv();
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return jsonResponse(
      { success: true, data: { version: 7, updatedAt: null, games: [] } },
      { headers: { ETag: '"v7"' } },
    );
  }) as typeof fetch;

  const res = await fetchEnvelope<{ version: number }>('/api/v1/catalog');
  assert.equal(res.notModified, false);
  assert.equal(res.etag, '"v7"');
  assert.deepEqual(res.data, { version: 7, updatedAt: null, games: [] });

  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, 'https://api.test/api/v1/catalog');
  assert.equal(url.searchParams.get('tenant'), 'javier');
});

test('fetchEnvelope envía If-None-Match y maneja 304', async () => {
  setEnv();
  let sent: string | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    sent = headers.get('If-None-Match');
    return new Response(null, { status: 304 });
  }) as typeof fetch;

  const res = await fetchEnvelope('/api/v1/catalog', { etag: '"v7"' });
  assert.equal(sent, '"v7"');
  assert.equal(res.notModified, true);
  assert.equal(res.data, null);
});

test('fetchEnvelope lanza ApiError con code en error del backend', async () => {
  setEnv();
  globalThis.fetch = (async () =>
    jsonResponse(
      { success: false, error: { code: 'TENANT_NOT_FOUND', message: 'Catálogo no encontrado' } },
      { status: 404 },
    )) as typeof fetch;

  await assert.rejects(
    () => fetchEnvelope('/api/v1/catalog'),
    (err: unknown) =>
      err instanceof ApiError && err.status === 404 && err.code === 'TENANT_NOT_FOUND' && err.message === 'Catálogo no encontrado',
  );
});

test('fetchEnvelope rechaza cuerpos sin envelope', async () => {
  setEnv();
  globalThis.fetch = (async () => jsonResponse({ version: 1 })) as typeof fetch;

  await assert.rejects(
    () => fetchEnvelope('/api/v1/catalog'),
    (err: unknown) => err instanceof ApiError && err.code === 'BAD_ENVELOPE',
  );
});

test('fetchEnvelope añade query extra', async () => {
  setEnv();
  let captured = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    captured = String(input);
    return jsonResponse({ success: true, data: { changed: false, version: 2, updatedAt: null } });
  }) as typeof fetch;

  await fetchEnvelope('/api/v1/catalog/sync', { query: { since: '2' } });
  const url = new URL(captured);
  assert.equal(url.searchParams.get('since'), '2');
  assert.equal(url.searchParams.get('tenant'), 'javier');
});
