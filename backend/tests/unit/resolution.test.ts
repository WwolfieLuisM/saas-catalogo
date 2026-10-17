import { describe, expect, it } from 'vitest';
import {
  resolveCover,
  resolveFinal,
  resolveGenres,
  resolvePlatformIds,
} from '../../src/modules/games/resolution.js';

const base = {
  id: 'base-1',
  title: 'Heredado',
  description: 'Descripción de biblioteca',
  sizeValue: 10,
  sizeUnit: 'GB' as const,
  releaseYear: 2020,
  categoryId: 'cat-base',
  minimumRequirements: { cpu: 'i5' },
  recommendedRequirements: { cpu: 'i7' },
};

const variant = {
  baseGameId: 'base-1',
  platformId: 'pc',
  sizeValue: 12.5,
  sizeUnit: 'GB' as const,
  minimumRequirements: { cpu: 'i5', gpu: 'RTX' },
  recommendedRequirements: null,
};

const tenant = {
  id: 'game-1',
  tenantId: 'tenant-1',
  title: null,
  description: null,
  sizeValue: null,
  sizeUnit: null,
  releaseYear: null,
  categoryId: null,
  minimumRequirements: null,
  recommendedRequirements: null,
  clearedFields: null,
};

describe('resolveFinal: jerarquía TenantGame → variante → BaseGame', () => {
  it('el override del tenant gana sobre variante y biblioteca', () => {
    expect(resolveFinal({ ...tenant, title: 'Personalizado' }, variant, base, 'title')).toBe(
      'Personalizado',
    );
    expect(resolveFinal({ ...tenant, sizeValue: 99 }, variant, base, 'sizeValue')).toBe(99);
  });

  it('hereda de la variante cuando el tenant no define el campo', () => {
    expect(resolveFinal(tenant, variant, base, 'sizeValue')).toBe(12.5);
    expect(resolveFinal(tenant, variant, base, 'minimumRequirements')).toEqual({
      cpu: 'i5',
      gpu: 'RTX',
    });
  });

  it('la variante gana a la identidad de la biblioteca en campos de variante', () => {
    expect(resolveFinal(tenant, variant, base, 'sizeValue')).not.toBe(base.sizeValue);
    expect(resolveFinal(tenant, variant, base, 'minimumRequirements')).not.toEqual(
      base.minimumRequirements,
    );
  });

  it('salta la variante en campos que solo viven en identidad (title, description, releaseYear, categoryId)', () => {
    expect(resolveFinal(tenant, null, base, 'title')).toBe('Heredado');
    expect(resolveFinal(tenant, null, base, 'description')).toBe('Descripción de biblioteca');
    expect(resolveFinal(tenant, null, base, 'releaseYear')).toBe(2020);
    expect(resolveFinal(tenant, null, base, 'categoryId')).toBe('cat-base');
  });

  it('hereda de la biblioteca cuando ni tenant ni variante aportan valor', () => {
    expect(resolveFinal(tenant, null, base, 'sizeValue')).toBe(10);
    expect(resolveFinal(tenant, { ...variant, sizeValue: null }, base, 'sizeValue')).toBe(10);
    expect(resolveFinal(tenant, null, base, 'recommendedRequirements')).toEqual({ cpu: 'i7' });
  });

  it('devuelve null cuando no hay valor en ningún nivel', () => {
    expect(resolveFinal(tenant, null, null, 'title')).toBeNull();
    expect(resolveFinal(tenant, null, null, 'description')).toBeNull();
    expect(resolveFinal(tenant, null, null, 'sizeValue')).toBeNull();
    expect(resolveFinal(tenant, null, null, 'minimumRequirements')).toBeNull();
  });

  it('soporta ofertas PERSONALIZADO sin baseGame', () => {
    expect(resolveFinal({ ...tenant, title: 'Propio' }, null, null, 'title')).toBe('Propio');
    expect(resolveFinal(tenant, null, null, 'title')).toBeNull();
  });

  it('acepta entradas null/undefined en cualquier nivel', () => {
    expect(resolveFinal(null, null, base, 'title')).toBe('Heredado');
    expect(resolveFinal(undefined, undefined, base, 'title')).toBe('Heredado');
  });
});

describe('resolveFinal: tricampo (heredar / personalizar / limpiar)', () => {
  it('NULL = heredar: el campo nulo en el tenant no tapa la biblioteca', () => {
    expect(resolveFinal({ ...tenant, description: null }, null, base, 'description')).toBe(
      'Descripción de biblioteca',
    );
  });

  it('EXPLÍCITO = personalizar: valor del tenant tapa la biblioteca', () => {
    expect(
      resolveFinal({ ...tenant, description: 'Texto propio' }, null, base, 'description'),
    ).toBe('Texto propio');
  });

  it('LIMPIO = borrar heredado: clearedFields hace null aunque la biblioteca tenga valor', () => {
    const cleared = { ...tenant, clearedFields: ['title', 'sizeValue'] };
    expect(resolveFinal(cleared, variant, base, 'title')).toBeNull();
    expect(resolveFinal(cleared, variant, base, 'sizeValue')).toBeNull();
  });

  it('limpio gana incluso si el valor explícito existe en el tenant', () => {
    const contradiccion = { ...tenant, title: 'X', clearedFields: ['title'] };
    expect(resolveFinal(contradiccion, null, base, 'title')).toBeNull();
  });

  it('clearedFields solo afecta a los campos listados', () => {
    const cleared = { ...tenant, clearedFields: ['title'] };
    expect(resolveFinal(cleared, null, base, 'description')).toBe('Descripción de biblioteca');
    expect(resolveFinal(cleared, null, base, 'releaseYear')).toBe(2020);
  });

  it('ignora clearedFields malformado (no array o elementos no string)', () => {
    expect(resolveFinal({ ...tenant, clearedFields: { fields: ['title'] } }, null, base, 'title')).toBe(
      'Heredado',
    );
    expect(resolveFinal({ ...tenant, clearedFields: [42, null] }, null, base, 'title')).toBe('Heredado');
    expect(resolveFinal({ ...tenant, clearedFields: 'title' }, null, base, 'title')).toBe('Heredado');
  });
});

describe('resolveCover: GameMedia ?? LibraryMedia', () => {
  const coverMedia = (overrides: Record<string, unknown> = {}) => ({
    id: 'm1',
    kind: 'COVER',
    url: 'https://cdn/t.jpg',
    status: 'OK',
    sortOrder: 0,
    ...overrides,
  });

  it('la portada del tenant (GameMedia) gana a la de biblioteca', () => {
    const cover = resolveCover([coverMedia()], [coverMedia({ id: 'l1', url: 'https://cdn/lib.jpg' })]);
    expect(cover?.id).toBe('m1');
    expect(cover?.url).toBe('https://cdn/t.jpg');
  });

  it('hereda la portada de biblioteca cuando el tenant no tiene GameMedia', () => {
    const cover = resolveCover([], [coverMedia({ id: 'l1', url: 'https://cdn/lib.jpg' })]);
    expect(cover?.id).toBe('l1');
  });

  it('limpia la portada heredada cuando clearedFields incluye cover', () => {
    const cover = resolveCover([], [coverMedia()], ['cover']);
    expect(cover).toBeNull();
  });

  it('limpio gana incluso con GameMedia propio', () => {
    expect(resolveCover([coverMedia()], [coverMedia()], ['cover'])).toBeNull();
  });

  it('ignora media sin url, de otro kind o sin estado OK', () => {
    expect(resolveCover([coverMedia({ url: null })], [])).toBeNull();
    expect(resolveCover([coverMedia({ kind: 'SHOT' })], [])).toBeNull();
    expect(resolveCover([coverMedia({ status: 'ERROR' })], [])).toBeNull();
    expect(
      resolveCover([coverMedia({ url: null })], [coverMedia({ id: 'l1' })])?.id,
    ).toBe('l1');
  });

  it('devuelve null cuando no hay portada en ningún nivel', () => {
    expect(resolveCover([], [])).toBeNull();
    expect(resolveCover([], [], ['cover'])).toBeNull();
  });

  it('ordena por sortOrder y toma la primera portada válida', () => {
    const covers = [
      coverMedia({ id: 'b', sortOrder: 5 }),
      coverMedia({ id: 'a', sortOrder: 1 }),
    ];
    expect(resolveCover(covers, [])?.id).toBe('a');
  });
});

describe('resolveGenres: puentes del tenant ?? géneros de biblioteca', () => {
  it('usa los géneros del tenant cuando existen', () => {
    expect(resolveGenres(['g1', 'g2'], ['g3'], null)).toEqual(['g1', 'g2']);
  });

  it('hereda los de biblioteca cuando el tenant no tiene puentes', () => {
    expect(resolveGenres([], ['g3'], null)).toEqual(['g3']);
    expect(resolveGenres([], ['g3'], [])).toEqual(['g3']);
  });

  it('limpia los géneros heredados con clearedFields genres', () => {
    expect(resolveGenres([], ['g3'], ['genres'])).toEqual([]);
  });

  it('devuelve lista vacía sin biblioteca', () => {
    expect(resolveGenres([], [], null)).toEqual([]);
  });
});

describe('resolvePlatformIds: plataforma de la oferta + puentes', () => {
  it('incluye la plataforma de la oferta y deduplica con los puentes', () => {
    expect(resolvePlatformIds('pc', ['pc', 'ps5'])).toEqual(['pc', 'ps5']);
  });

  it('sin puentes devuelve solo la plataforma de la oferta', () => {
    expect(resolvePlatformIds('pc', [])).toEqual(['pc']);
  });
});
