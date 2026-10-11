import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacets } from './facets.ts';
import { filterGames, SORTS, SORT_LABELS } from './filter.ts';
import { demoCatalog } from './demo.ts';

const { games } = demoCatalog();

test('buildFacets counts cats genres platforms and max price', () => {
  const f = buildFacets(games);
  assert.ok(f.cats.length > 0);
  assert.ok(f.genres.length > 0);
  assert.ok(f.platforms.length > 0);
  assert.ok(f.maxPriceAll >= Math.max(...games.map((g) => g.price ?? 0)));
  assert.equal(f.maxPriceAll % 500, 0);
  assert.equal(f.cats[0].label, f.cats[0].value);
});

test('filterGames by q category and sort', () => {
  const az = filterGames(games, {
    q: '',
    cat: '',
    genre: '',
    platform: '',
    maxPrice: null,
    sort: 'az',
  });
  const names = az.map((g) => g.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'es')));

  const hades = filterGames(games, {
    q: 'hades',
    cat: '',
    genre: '',
    platform: '',
    maxPrice: null,
    sort: 'recent',
  });
  assert.equal(hades.length, 1);
  assert.equal(hades[0].name, 'Hades');
});

test('filterGames respects maxPrice and null means unlimited', () => {
  const cheap = filterGames(games, {
    q: '',
    cat: '',
    genre: '',
    platform: '',
    maxPrice: 16,
    sort: 'priceAsc',
  });
  assert.ok(cheap.every((g) => (g.price ?? 0) <= 16));

  const all = filterGames(games, {
    q: '',
    cat: '',
    genre: '',
    platform: '',
    maxPrice: null,
    sort: 'recent',
  });
  assert.equal(all.length, games.length);
});

test('SORTS and SORT_LABELS cover every sort key', () => {
  assert.equal(SORTS.length, 5);
  for (const s of SORTS) {
    assert.ok(SORT_LABELS[s]);
  }
});

test('price sort orders ascending and descending', () => {
  const asc = filterGames(games, {
    q: '',
    cat: '',
    genre: '',
    platform: '',
    maxPrice: null,
    sort: 'priceAsc',
  });
  for (let i = 1; i < asc.length; i++) {
    assert.ok((asc[i].price ?? 0) >= (asc[i - 1].price ?? 0));
  }
});
