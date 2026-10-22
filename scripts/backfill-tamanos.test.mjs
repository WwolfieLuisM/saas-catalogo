import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procesar } from './backfill-tamanos.mjs';

// fetch de prueba: enruta por fragmentos de URL y devuelve json; registra llamadas.
function fetchDePruebas(rutas) {
  return async (url) => {
    const u = String(url);
    for (const [fragmento, json] of rutas) {
      if (u.includes(fragmento)) {
        return { ok: true, status: 200, json: async () => json(u) };
      }
    }
    throw new Error('fetch inesperado en el test: ' + u);
  };
}

const steamAppId = (id, nombre, storage) => [
  ['appdetails', (u) => {
    const ids = new URL(u).searchParams.get('appids');
    return { [ids]: { success: true, data: { pc_requirements: { minimum: `OS<br>Storage: ${storage} available space` } } } };
  }],
  ['storesearch', () => ({ total: 1, items: [{ id: id, type: 'app', name: nombre }] })],
];

const pcgwBusqueda = (pagina) => [
  ['action=parse', () => ({ parse: { wikitext: { '*': `|minHD = 60 GB\n|recHD = 80 GB` } } })],
  ['action=query', (u) => {
    const q = new URL(u).searchParams.get('srsearch') || '';
    return { query: { search: q.includes('DELMARK') ? [] : [{ title: pagina }] } };
  }],
];

test('pasada 1: usa el appid de Steam del registro y marca misma-edicion 0.9', async () => {
  const llamadas = [];
  const fetchImpl = fetchDePruebas(
    steamAppId(367520, 'Hollow Knight', '50 GB').map(([f, j]) => [f, (u) => { llamadas.push(u); return j(u); }]),
  );
  const { registros } = await procesar({
    juegos: [{ slug: 'hollow-knight', title: 'Hollow Knight' }],
    steamIdx: new Map([['Hollow Knight', { id: 'G1', titulo: 'Hollow Knight', steam_appid: 367520, steam_nombre: 'Hollow Knight' }]]),
    pcgwIdx: new Map(),
    previos: [],
    fetchImpl,
  });
  assert.equal(registros.length, 1);
  const r = registros[0];
  assert.equal(r.slug, 'hollow-knight');
  assert.equal(r.size_gb, 50);
  assert.equal(r.modo, 'misma-edicion');
  assert.equal(r.fuente, 'Steam');
  assert.equal(r.confidence, 0.9);
  assert.equal(r.url, 'https://store.steampowered.com/app/367520');
  assert.ok(llamadas.every((u) => u.includes('appdetails')));
});

test('pasada 1: sin appid busca en Steam y si falla usa la pagina PCGW', async () => {
  const fetchImpl = fetchDePruebas([
    ['storesearch', () => ({ total: 0, items: [] })],
    ...pcgwBusqueda('Cyberpunk 2077'),
  ]);
  const { registros } = await procesar({
    juegos: [{ slug: 'cyberpunk-2077', title: 'Cyberpunk 2077' }],
    steamIdx: new Map([['Cyberpunk 2077', { id: 'G2', titulo: 'Cyberpunk 2077', steam_appid: null, steam_nombre: null }]]),
    pcgwIdx: new Map([['G2', { id: 'G2', titulo: 'Cyberpunk 2077', pagina: 'Cyberpunk 2077', url: 'https://www.pcgamingwiki.com/wiki/Cyberpunk_2077' }]]),
    previos: [],
    fetchImpl,
  });
  const r = registros[0];
  // storesearch del titulo completo no encuentra nada (items vacios) -> PCGW
  assert.equal(r.fuente, 'PCGamingWiki');
  assert.equal(r.modo, 'misma-edicion');
  assert.equal(r.confidence, 0.9);
  assert.equal(r.size_gb, 60);
  assert.ok(String(r.url).startsWith('https://www.pcgamingwiki.com/wiki/'));
});

test('pasada 2: titulo de edicion cae en la pagina base y se marca juego-base 0.6', async () => {
  const fetchImpl = fetchDePruebas([
    // Steam del titulo completo no encuentra appid
    ['storesearch', () => ({ total: 0, items: [] })],
    // PCGW: la busqueda del titulo completo (marcada DELMARK) no devuelve nada;
    // la del titulo basico si
    ['action=parse', () => ({ parse: { wikitext: { '*': '|minHD = 45 GB' } } })],
    ['action=query', (u) => {
      const q = new URL(u).searchParams.get('srsearch') || '';
      return { query: { search: q.toLowerCase().includes('deluxe') ? [] : [{ title: 'Elden Ring' }] } };
    }],
  ]);
  const { registros } = await procesar({
    juegos: [{ slug: 'elden-ring-deluxe', title: 'Elden Ring: Deluxe Edition' }],
    steamIdx: new Map([['Elden Ring: Deluxe Edition', { id: 'G3', titulo: 'Elden Ring: Deluxe Edition', steam_appid: null, steam_nombre: null }]]),
    pcgwIdx: new Map([['G3', { id: 'G3', titulo: 'Elden Ring: Deluxe Edition', pagina: null, url: null }]]),
    previos: [],
    fetchImpl,
  });
  const r = registros[0];
  assert.equal(r.size_gb, 45);
  assert.equal(r.fuente, 'PCGamingWiki');
  assert.equal(r.modo, 'juego-base');
  assert.equal(r.confidence, 0.6);
  assert.ok(String(r.notas).includes('Elden Ring'));
});

test('sin fuente en ninguna pasada queda residual con detalle', async () => {
  const fetchImpl = fetchDePruebas([
    ['storesearch', () => ({ total: 0, items: [] })],
    ['action=query', () => ({ query: { search: [] } })],
  ]);
  const { registros } = await procesar({
    juegos: [{ slug: 'juego-huerfano', title: 'Juego Huerfano Deluxe' }],
    steamIdx: new Map([['Juego Huerfano Deluxe', { id: 'G4', titulo: 'Juego Huerfano Deluxe', steam_appid: null, steam_nombre: null }]]),
    pcgwIdx: new Map(),
    previos: [],
    fetchImpl,
  });
  const r = registros[0];
  assert.equal(r.size_gb, null);
  assert.equal(r.detalle, 'sin fuente');
  assert.equal(r.slug, 'juego-huerfano');
});

test('reanudacion: los slugs ya presentes no se vuelven a consultar', async () => {
  const fetchImpl = async () => {
    throw new Error('no deberia consultar: el slug ya esta en previos');
  };
  const { registros, consultas } = await procesar({
    juegos: [{ slug: 'hollow-knight', title: 'Hollow Knight' }],
    steamIdx: new Map(),
    pcgwIdx: new Map(),
    previos: [{ slug: 'hollow-knight', size_gb: 50 }],
    fetchImpl,
  });
  assert.equal(registros.length, 1);
  assert.equal(consultas, 0);
  assert.equal(registros[0].size_gb, 50);
});

test('limite: solo procesa N registros nuevos dejando el resto para otra corrida', async () => {
  let llamadas = 0;
  const fetchImpl = async (u) => {
    llamadas += 1;
    if (String(u).includes('storesearch')) return { ok: true, json: async () => ({ total: 0, items: [] }) };
    if (String(u).includes('action=query')) return { ok: true, json: async () => ({ query: { search: [] } }) };
    return { ok: true, json: async () => ({}) };
  };
  const juegos = ['Uno', 'Dos', 'Tres'].map((t) => ({ slug: t.toLowerCase(), title: t + ' Deluxe' }));
  const steamIdx = new Map(juegos.map((j) => [j.title, { id: null, titulo: j.title, steam_appid: null, steam_nombre: null }]));
  const { registros } = await procesar({ juegos, steamIdx, pcgwIdx: new Map(), previos: [], fetchImpl, limite: 2 });
  assert.equal(registros.length, 2);
  assert.ok(llamadas > 0);
});
