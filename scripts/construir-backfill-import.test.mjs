import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformar, diffSoloTamanos, construir, tablaNotas } from './construir-backfill-import.mjs';

const HOY = '2026-10-22';

function juegoBase() {
  return {
    title: 'Hollow Knight',
    slug: 'hollow-knight',
    description: 'Un metroidvania.',
    releaseYear: 2017,
    developer: 'Team Cherry',
    publisher: 'Team Cherry',
    keywords: 'metroidvania indie',
    categorySlug: 'plataformas',
    genreSlugs: ['plataformas'],
    sizeValue: null,
    sizeUnit: null,
    minimumRequirements: null,
    recommendedRequirements: null,
    coverUrl: 'https://cdn.example/hollow.jpg',
    platformVariants: [
      { platformSlug: 'pc', sizeValue: null, sizeUnit: null, minimumRequirements: null, recommendedRequirements: null, provenance: null },
      { platformSlug: 'ps4', sizeValue: null, sizeUnit: null, minimumRequirements: null, recommendedRequirements: null },
    ],
  };
}

function registro(sobrescribe = {}) {
  return {
    id: 'G1',
    slug: 'hollow-knight',
    titulo: 'Hollow Knight',
    size_gb: 50,
    fuente: 'Steam',
    url: 'https://store.steampowered.com/app/367520',
    confidence: 0.9,
    modo: 'misma-edicion',
    notas: '',
    detalle: 'pasada 1 steam',
    ...sobrescribe,
  };
}

test('transformar pone size en registro y provenance en todas las variantes sin tocar lo demas', () => {
  const original = juegoBase();
  const salida = transformar(original, registro(), HOY);
  assert.equal(salida.sizeValue, 50);
  assert.equal(salida.sizeUnit, 'GB');
  for (const v of salida.platformVariants) {
    assert.equal(v.sizeValue, 50);
    assert.equal(v.sizeUnit, 'GB');
    assert.deepEqual(v.provenance, {
      source: 'Steam',
      sourceUrl: 'https://store.steampowered.com/app/367520',
      confidence: 0.9,
      ingestedAt: HOY,
      notes: '',
    });
  }
  // el registro original queda intacto (el builder no muta lote1)
  assert.equal(original.sizeValue, null);
  assert.equal(original.platformVariants[1].provenance, undefined);
  // fuera de tamaños todo igual
  assert.equal(salida.title, 'Hollow Knight');
  assert.equal(salida.platformVariants[0].platformSlug, 'pc');
  assert.equal(salida.platformVariants[0].minimumRequirements, null);
  assert.deepEqual(diffSoloTamanos(original, salida), []);
});

test('diffSoloTamanos ignora solo tamaños y provenance y señala cualquier otra cosa', () => {
  const original = juegoBase();
  const salida = transformar(original, registro(), HOY);
  assert.deepEqual(diffSoloTamanos(original, salida), []);

  const conTitulo = { ...salida, title: 'Otro titulo' };
  assert.deepEqual(diffSoloTamanos(original, conTitulo), ['title']);

  const conVariantes = {
    ...salida,
    platformVariants: salida.platformVariants.map((v, i) => (i === 0 ? { ...v, platformSlug: 'xbox' } : v)),
  };
  assert.deepEqual(diffSoloTamanos(original, conVariantes), ['platformVariants[0].platformSlug']);

  // tamaño y provenance cambiando a lo suyo no cuenta como diferencia
  const variante = { ...salida.platformVariants[0], sizeValue: 99, provenance: { source: 'manual' } };
  assert.deepEqual(diffSoloTamanos(original, { ...salida, sizeValue: 99, platformVariants: [variante, salida.platformVariants[1]] }), []);
});

test('construir: solo size_gb != null, la entrada manual gana y los contadores cuadran', () => {
  const lote1 = {
    schema: 'library-import@2',
    source: 'original',
    generatedAt: '2026-10-20T00:00:00.000Z',
    games: [
      { ...juegoBase(), slug: 'juego-auto' },
      { ...juegoBase(), slug: 'juego-residual' },
      { ...juegoBase(), slug: 'juego-residual-2' },
    ],
  };
  const intermedio = {
    registros: [
      registro({ slug: 'juego-auto' }),
      registro({ slug: 'juego-residual', size_gb: null, fuente: null, url: null, confidence: null, modo: null, notas: '', detalle: 'sin fuente' }),
      registro({ slug: 'juego-residual-2', size_gb: null, fuente: null, url: null, confidence: null, modo: null, notas: '', detalle: 'sin fuente' }),
    ],
  };
  const manual = {
    registros: [
      registro({ slug: 'juego-residual-2', size_gb: 80, fuente: 'Wikipedia', url: 'https://es.wikipedia.org/wiki/Ejemplo', confidence: 0.7, modo: 'manual', notas: 'revisado a mano' }),
    ],
  };
  const { envelope, resumen } = construir({ lote1, intermedio, manual, hoy: HOY });

  assert.equal(envelope.schema, 'library-import@2');
  assert.equal(envelope.source, 'Fase G1 backfill de tamaños');
  assert.equal(envelope.games.length, 2);

  const auto = envelope.games.find((g) => g.slug === 'juego-auto');
  assert.equal(auto.sizeValue, 50);
  assert.equal(auto.platformVariants[0].provenance.source, 'Steam');

  const aMano = envelope.games.find((g) => g.slug === 'juego-residual-2');
  assert.equal(aMano.sizeValue, 80);
  assert.equal(aMano.platformVariants[0].provenance.source, 'Wikipedia');
  assert.equal(aMano.platformVariants[0].provenance.sourceUrl, 'https://es.wikipedia.org/wiki/Ejemplo');
  assert.equal(aMano.platformVariants[0].provenance.confidence, 0.7);

  assert.equal(resumen.automatizados, 1);
  assert.equal(resumen.manuales, 1);
  assert.equal(resumen.recuperados, resumen.automatizados + resumen.manuales);
  assert.equal(resumen.recuperados, envelope.games.length);
  assert.deepEqual(resumen.diferencias, []);
});

test('notas: tabla con los juego-base primero y columnas slug..URL', () => {
  const registros = [
    registro({ slug: 'mismo-uno', titulo: 'Mismo Uno', modo: 'misma-edicion', fuente: 'Steam', url: 'https://store.steampowered.com/app/1', confidence: 0.9 }),
    registro({ slug: 'base-dos', titulo: 'Base Dos Deluxe Edition', modo: 'juego-base', fuente: 'PCGamingWiki', url: 'https://www.pcgamingwiki.com/wiki/Base_Dos', confidence: 0.6, notas: 'x' }),
  ];
  const md = tablaNotas(registros);
  assert.ok(md.includes('slug') && md.includes('título') && md.includes('confianza') && md.includes('URL'));
  assert.ok(md.indexOf('base-dos') < md.indexOf('mismo-uno'), 'los juego-base van primero');
  assert.ok(md.includes('https://www.pcgamingwiki.com/wiki/Base_Dos'));
});
