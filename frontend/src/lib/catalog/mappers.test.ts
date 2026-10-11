import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCup, sizeToGb, toFeedCard, toFeedCards } from './mappers.ts';
import type { PublicGame } from '@/types/catalog';

function makeGame(overrides: Partial<PublicGame> = {}): PublicGame {
  return {
    id: 'g1',
    title: 'Celeste',
    slug: 'celeste',
    description: 'Plataformas indie',
    price: 3000,
    currency: 'CUP',
    availability: true,
    size: { value: 1200, unit: 'MB', formatted: '1200 MB' },
    releaseYear: 2018,
    category: { id: 'c1', name: 'Aventura' },
    genres: [{ id: 'ge1', name: 'Plataformas' }],
    platforms: [{ id: 'p1', name: 'PC' }],
    coverImage: { url: 'https://cdn.example/cover.jpg', alt: 'Portada de Celeste' },
    screenshots: [{ url: 'https://cdn.example/s1.jpg' }],
    requirements: { minimum: {}, recommended: {} },
    ...overrides,
  };
}

test('formatCup usa notación en-US sin decimales', () => {
  assert.equal(formatCup(3500), '3,500');
  assert.equal(formatCup(0), '0');
  assert.equal(formatCup(1234567), '1,234,567');
});

test('sizeToGb convierte MB, GB y TB con 1 decimal', () => {
  assert.equal(sizeToGb(1200, 'MB'), 1.2);
  assert.equal(sizeToGb(70, 'GB'), 70);
  assert.equal(sizeToGb(1.5, 'TB'), 1536);
  assert.equal(sizeToGb(4, 'GB'), 4);
});

test('toFeedCard mapea un juego completo', () => {
  const card = toFeedCard(makeGame());
  assert.equal(card.id, 'g1');
  assert.equal(card.slug, 'celeste');
  assert.equal(card.title, 'Celeste');
  assert.equal(card.priceLabel, '3,000');
  assert.equal(card.hasPrice, true);
  assert.equal(card.currency, 'CUP');
  assert.equal(card.sizeLabel, '1.2 GB');
  assert.equal(card.sizeGb, 1.2);
  assert.equal(card.availability, true);
  assert.equal(card.coverUrl, 'https://cdn.example/cover.jpg');
  assert.equal(card.coverAlt, 'Portada de Celeste');
  assert.deepEqual(card.screenshots, ['https://cdn.example/s1.jpg']);
  assert.equal(card.category, 'Aventura');
  assert.deepEqual(card.genres, ['Plataformas']);
  assert.deepEqual(card.platforms, ['PC']);
  assert.equal(card.releaseYear, 2018);
  assert.equal(card.description, 'Plataformas indie');
});

test('toFeedCard maneja precio nulo y campos opcionales vacíos', () => {
  const card = toFeedCard(
    makeGame({
      price: null,
      description: null,
      releaseYear: null,
      category: null,
      genres: [],
      platforms: [],
      coverImage: null,
      screenshots: [],
    }),
  );
  assert.equal(card.priceLabel, 'Consultar');
  assert.equal(card.hasPrice, false);
  assert.equal(card.coverUrl, null);
  assert.equal(card.coverAlt, 'Celeste');
  assert.deepEqual(card.screenshots, []);
  assert.equal(card.category, null);
  assert.deepEqual(card.genres, []);
  assert.deepEqual(card.platforms, []);
});

test('toFeedCards preserva el orden', () => {
  const cards = toFeedCards([makeGame({ id: 'a', slug: 'a', title: 'A' }), makeGame({ id: 'b', slug: 'b', title: 'B' })]);
  assert.deepEqual(
    cards.map((card) => card.id),
    ['a', 'b'],
  );
});
