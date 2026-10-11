import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearCatalogCache, getCatalogCache, setCatalogCache } from './cache.ts';
import type { CatalogPayload } from '@/types/catalog';

const payload: CatalogPayload = {
  version: 3,
  updatedAt: '2026-10-01T00:00:00.000Z',
  games: [],
};

test('setCatalogCache / getCatalogCache roundtrip', () => {
  clearCatalogCache();
  assert.equal(getCatalogCache(), null);
  setCatalogCache({ etag: '"v3"', version: 3, data: payload, fetchedAt: 123 });
  const entry = getCatalogCache();
  assert.ok(entry);
  assert.equal(entry.etag, '"v3"');
  assert.equal(entry.version, 3);
  assert.deepEqual(entry.data, payload);
  assert.equal(entry.fetchedAt, 123);
});

test('clearCatalogCache vacía la entrada', () => {
  setCatalogCache({ etag: null, version: 1, data: payload, fetchedAt: 1 });
  clearCatalogCache();
  assert.equal(getCatalogCache(), null);
});

test('setCatalogCache sobrescribe la entrada anterior', () => {
  setCatalogCache({ etag: '"v1"', version: 1, data: payload, fetchedAt: 1 });
  setCatalogCache({ etag: '"v2"', version: 2, data: payload, fetchedAt: 2 });
  const entry = getCatalogCache();
  assert.ok(entry);
  assert.equal(entry.etag, '"v2"');
  assert.equal(entry.version, 2);
  clearCatalogCache();
});
