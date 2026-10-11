import type { CatalogPayload, PublicGame } from '@/types/catalog';

function demoGame(overrides: Partial<PublicGame> & Pick<PublicGame, 'id' | 'title' | 'slug'>): PublicGame {
  return {
    description: 'Juego de demostración (NEXT_PUBLIC_DEMO=true). No son datos reales del catálogo.',
    price: 3000,
    currency: 'CUP',
    availability: true,
    size: { value: 70, unit: 'GB', formatted: '70 GB' },
    releaseYear: 2024,
    category: { id: 'demo-cat', name: 'Acción' },
    genres: [{ id: 'demo-genre', name: 'Mundo abierto' }],
    platforms: [{ id: 'demo-plat', name: 'PC' }],
    coverImage: null,
    screenshots: [],
    requirements: { minimum: {}, recommended: {} },
    ...overrides,
  };
}

export const demoCatalogPayload: CatalogPayload = {
  version: 0,
  updatedAt: new Date(0).toISOString(),
  games: [
    demoGame({ id: 'demo-1', title: 'Juego Demo 1', slug: 'juego-demo-1' }),
    demoGame({
      id: 'demo-2',
      title: 'Juego Demo 2 (sin precio)',
      slug: 'juego-demo-2',
      price: null,
      availability: false,
      size: { value: 512, unit: 'MB', formatted: '512 MB' },
    }),
    demoGame({
      id: 'demo-3',
      title: 'Juego Demo 3 (TB)',
      slug: 'juego-demo-3',
      price: 4500,
      size: { value: 1.5, unit: 'TB', formatted: '1.5 TB' },
      releaseYear: null,
      category: null,
      genres: [],
      platforms: [{ id: 'demo-plat-2', name: 'PS5' }],
    }),
  ],
};
