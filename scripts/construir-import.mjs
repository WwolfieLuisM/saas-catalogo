import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Constructor generico de ficheros library-import@2 (evolucion de construir-import-50.mjs).
// Uso:
//   node scripts/construir-import.mjs <filas.csv> <steam.json> <rawg.json> <destino.json>
//   <filas.csv>  cualquier CSV con las columnas del piloto (id, titulo_limpio, anio, ganador_anio, portada, ...)
//   <steam.json> {"registros":[{id, steam_appid, descripcion, size_gb, requisitos_min, ...}]}
//   <rawg.json>  {"registros":[{id, rawg_id, descripcion, generos, ...}]}
// Validar despues: cd backend && npx tsx ../scripts/validar-import.ts ../tasks/<destino>.json

const HERE = fileURLToPath(new URL('.', import.meta.url));
const BASE = `file:///${HERE.replace(/\\/g, '/')}`;
const HOY = new Date().toISOString().slice(0, 10);

// Taxonomia global real (leida de produccion con sesion SUPER_ADMIN).
const CATEGORIAS = ['accion', 'aventura', 'carreras', 'deportes', 'otros', 'puzzle', 'rol', 'sigilo', 'simulacion', 'terror'];
const GENEROS = [
  'accion', 'arcade', 'aventura', 'carreras', 'cartas-y-mesa', 'casual', 'ciencia-ficcion',
  'conduccion', 'construccion', 'deportes', 'disparos', 'estrategia', 'estrategia-en-tiempo-real',
  'fantasia', 'futbol', 'granja', 'hack-and-slash', 'indie', 'lucha', 'moba', 'mitologia',
  'mundo-abierto', 'musica', 'plataformas', 'point-and-click', 'por-turnos', 'postapocaliptico',
  'puzzle', 'relajante', 'rol', 'sandbox', 'simulacion', 'supervivencia', 'tactico', 'western',
];
const PLATAFORMAS = ['pc', 'ps4', 'ps5', 'switch', 'xbox-one', 'xbox-series-x'];

// Genero de Steam -> diccionario global. Solo equivalencias directas.
const GENERO_STEAM = {
  Action: 'accion',
  Adventure: 'aventura',
  RPG: 'rol',
  Strategy: 'estrategia',
  Simulation: 'simulacion',
  Casual: 'casual',
  Indie: 'indie',
  Sports: 'deportes',
  Racing: 'carreras',
  Fighting: 'lucha',
};

// Genero de IGDB -> diccionario global (mapa aprobado en tasks/mapa-generos-import.md:
// TBS con doble slug; Visual Novel se descarta por no tener equivalencia).
const GENERO_IGDB = {
  Adventure: ['aventura'],
  Indie: ['indie'],
  'Role-playing (RPG)': ['rol'],
  Simulator: ['simulacion'],
  Strategy: ['estrategia'],
  Shooter: ['disparos'],
  "Hack and slash/Beat 'em up": ['hack-and-slash'],
  Puzzle: ['puzzle'],
  Platform: ['plataformas'],
  'Real Time Strategy (RTS)': ['estrategia-en-tiempo-real'],
  Racing: ['carreras'],
  Arcade: ['arcade'],
  Tactical: ['tactico'],
  Fighting: ['lucha'],
  Sport: ['deportes'],
  'Turn-based strategy (TBS)': ['por-turnos', 'estrategia'],
  'Point-and-click': ['point-and-click'],
  'Card & Board Game': ['cartas-y-mesa'],
  Music: ['musica'],
  MOBA: ['moba'],
};

// Genero -> categoria. Solo donde la equivalencia es directa; el resto queda en 'otros'.
const CATEGORIA_POR_GENERO = {
  accion: 'accion', disparos: 'accion', lucha: 'accion', 'hack-and-slash': 'accion',
  aventura: 'aventura', plataformas: 'aventura', 'point-and-click': 'aventura',
  rol: 'rol',
  simulacion: 'simulacion',
  deportes: 'deportes', futbol: 'deportes',
  carreras: 'carreras', conduccion: 'carreras',
  puzzle: 'puzzle', 'cartas-y-mesa': 'puzzle',
};

// Longitudes maximas de strictRequirementsSchema (zod corta por la via larga).
const TOPE_REQ = { cpu: 150, gpu: 150, ram: 50, os: 100, directX: 50, storage: 100 };

const parseCsv = (text) => {
  text = text.replace(/^﻿/, '');
  const filas = [];
  let fila = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { fila.push(cur); cur = ''; }
    else if (c === '\n') { fila.push(cur); filas.push(fila); fila = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || fila.length) { fila.push(cur); filas.push(fila); }
  const cabecera = filas.shift();
  return filas.filter((f) => f.length === cabecera.length)
    .map((f) => Object.fromEntries(cabecera.map((h, i) => [h, f[i]])));
};

const leerJson = (ruta) => JSON.parse(fs.readFileSync(ruta, 'utf8'));

const slugify = (t) => String(t)
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 50)
  .replace(/-+$/g, '');

const cortar = (s, max) => (s && s.length > max ? `${s.slice(0, max).trimEnd()}` : (s ?? null));

const presentes = (obj) => {
  const salida = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.trim() !== '') salida[k] = v.trim().slice(0, TOPE_REQ[k]);
  }
  return Object.keys(salida).length ? salida : null;
};

function main() {
  const [rutaFilas, rutaSteam, rutaRawg, rutaDestino] = process.argv.slice(2);
  if (!rutaFilas || !rutaSteam || !rutaRawg || !rutaDestino) {
    console.error('Uso: node scripts/construir-import.mjs <filas.csv> <steam.json> <rawg.json> <destino.json>');
    process.exit(2);
  }

  const filas = parseCsv(fs.readFileSync(rutaFilas, 'utf8'));
  const steam = leerJson(rutaSteam).registros;
  const rawg = leerJson(rutaRawg).registros;
  const porId = (arr) => new Map(arr.map((f) => [f.id, f]));
  const steamPorId = porId(steam);
  const rawgPorId = porId(rawg);

  const slugsVistos = new Set();
  const avisos = [];
  const games = [];
  const cobertura = { conTamano: 0, conReq: 0, conDesc: 0, conDev: 0, conGen: 0, conPortada: 0 };
  const nombresSteam = new Set();

  for (const fila of filas) {
    const s = steamPorId.get(fila.id) ?? {};
    const g = rawgPorId.get(fila.id) ?? {};
    const titulo = fila.titulo_limpio;

    for (const n of s.generos_steam ?? []) nombresSteam.add(n);

    // --- generos: union de las tres fuentes, ya traducidos al diccionario global
    const desdeSteam = (s.generos_steam ?? []).map((n) => GENERO_STEAM[n]).filter(Boolean);
    const desdeRawg = g.generos ?? [];
    const desdeIgdb = String(fila.generos ?? '').split('|').map((t) => GENERO_IGDB[t.trim()] ?? []).flat();
    const union = [...new Set([...desdeSteam, ...desdeRawg, ...desdeIgdb])];
    const generos = union.filter((x) => GENEROS.includes(x));
    if (generos.length !== union.length) {
      avisos.push(`${titulo}: se descartaron generos fuera del diccionario`);
    }

    // --- categoria: primera con equivalencia directa, si no 'otros'
    const categoria = generos.map((x) => CATEGORIA_POR_GENERO[x]).find(Boolean) ?? 'otros';

    // --- slug unico dentro del fichero
    let slug = slugify(titulo);
    if (slug.length < 3) slug = `${slug}-juego`.replace(/^-+/, '').slice(0, 50);
    let n = 2;
    while (slugsVistos.has(slug)) slug = `${slugify(titulo).slice(0, 45)}-${n++}`;
    slugsVistos.add(slug);

    // --- size (solo Steam; RAWG no lo publica)
    const sizeGb = typeof s.size_gb === 'number' && s.size_gb > 0 ? s.size_gb : null;

    // --- requisitos (solo Steam; se prefiere la variante en espanol del pase ES)
    const minReq = presentes(s.requisitos_min_es ?? s.requisitos_min ?? {})
      ?? (g.requisitos_min ? presentes(g.requisitos_min) : null);
    const recReq = presentes(s.requisitos_rec_es ?? s.requisitos_rec ?? {}) ?? minReq;

    // --- descripcion / desarrollador / editor: Steam primero (ES si existe; EN de
    // respaldo), RAWG al final. El catalogo es en espanol.
    const descripcion = cortar(s.descripcion_es ?? s.descripcion ?? g.descripcion, 5000);
    const desarrollador = cortar(s.developer ?? g.developer, 150);
    const editor = cortar(s.publisher ?? g.publisher, 150);
    const portadaUrl = s.portada_steam ?? fila.portada;

    const fuenteMeta = s.steam_appid ? 'steam' : (g.rawg_id ? 'rawg' : null);
    const urlFuente = s.steam_appid
      ? `https://store.steampowered.com/app/${s.steam_appid}/`
      : (g.rawg_slug ? `https://rawg.io/games/${g.rawg_slug}` : undefined);

    const confianza = typeof s.similitud === 'number'
      ? s.similitud
      : (typeof g.similitud === 'number' ? g.similitud : undefined);

    const notas = sizeGb
      ? `Tamano ${sizeGb} GB y requisitos extraidos de pc_requirements de la Steam store.`
      : (fuenteMeta === 'rawg'
        ? 'RAWG aporta descripcion, generos y desarrollador; no publica tamano de instalacion.'
        : 'Sin tamano publicado por la fuente.');

    const variante = {
      platformSlug: 'pc',
      sizeValue: sizeGb,
      sizeUnit: sizeGb ? 'GB' : null,
      minimumRequirements: minReq,
      recommendedRequirements: recReq,
      provenance: {
        source: fuenteMeta ?? 'igdb',
        sourceUrl: urlFuente,
        confidence: confianza,
        ingestedAt: HOY,
        notes: notas.slice(0, 300),
      },
    };

    const keywords = [...new Set([...(s.generos_steam ?? []), ...(g.generos_steam ?? [])])]
      .join(', ').slice(0, 500);

    const record = {
      title: titulo,
      slug,
      description: descripcion,
      releaseYear: Number(fila.ganador_anio) || Number(fila.anio) || null,
      developer: desarrollador,
      publisher: editor,
      keywords: keywords || null,
      categorySlug: categoria,
      genreSlugs: generos,
      sizeValue: sizeGb,
      sizeUnit: sizeGb ? 'GB' : null,
      minimumRequirements: minReq,
      recommendedRequirements: recReq,
      coverUrl: portadaUrl && portadaUrl.startsWith('https://') ? portadaUrl : null,
      platformVariants: [variante],
    };

    // --- prevalidacion local contra las reglas del esquema
    const err = [];
    if (record.title.length < 2 || record.title.length > 150) err.push(`title ${record.title.length}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug) || record.slug.length < 3 || record.slug.length > 50) err.push(`slug "${record.slug}"`);
    if (record.coverUrl && !record.coverUrl.startsWith('https://')) err.push('coverUrl no https');
    if (record.releaseYear !== null && (record.releaseYear < 1970 || record.releaseYear > 2100)) err.push(`releaseYear ${record.releaseYear}`);
    if (!CATEGORIAS.includes(record.categorySlug)) err.push(`categoria "${record.categorySlug}"`);
    for (const x of record.genreSlugs) if (!GENEROS.includes(x)) err.push(`genero "${x}"`);
    if (record.description && record.description.length > 5000) err.push(`description ${record.description.length}`);
    if (record.keywords && record.keywords.length > 500) err.push(`keywords ${record.keywords.length}`);
    for (const [campo, obj] of [['min', minReq], ['rec', recReq]]) {
      if (!obj) continue;
      for (const [k, v] of Object.entries(obj)) {
        if (!(k in TOPE_REQ)) err.push(`${campo}.${k} no permitido`);
        else if (v.length > TOPE_REQ[k]) err.push(`${campo}.${k} ${v.length} > ${TOPE_REQ[k]}`);
      }
    }
    if ((record.sizeValue === null) !== (record.sizeUnit === null)) err.push('size en pareja rota');
    if (!PLATAFORMAS.includes(variante.platformSlug)) err.push('platformSlug invalido');
    if (typeof variante.provenance.confidence === 'number' && (variante.provenance.confidence < 0 || variante.provenance.confidence > 1)) err.push('confidence fuera de rango');
    if (err.length) avisos.push(`${titulo} -> ${err.join(' | ')}`);

    if (sizeGb) cobertura.conTamano++;
    if (minReq) cobertura.conReq++;
    if (descripcion) cobertura.conDesc++;
    if (desarrollador) cobertura.conDev++;
    if (generos.length) cobertura.conGen++;
    if (record.coverUrl) cobertura.conPortada++;

    games.push(record);
  }

  const fuente = 'Metadatos de Steam store y RAWG (https://rawg.io). '
    + 'Uso de datos de RAWG con atribucion a https://rawg.io. Portadas: Steam e IGDB.';

  const envelope = {
    schema: 'library-import@2',
    generatedAt: new Date().toISOString(),
    source: fuente.slice(0, 300),
    games,
  };

  fs.writeFileSync(rutaDestino, JSON.stringify(envelope, null, 2), 'utf8');

  console.log('=== GENERADO ===');
  console.log(JSON.stringify({
    filasEntrada: filas.length,
    juegos: games.length,
    ...cobertura,
    sinTamano: games.filter((r) => r.sizeValue === null).length,
    sinRequisitos: games.filter((r) => r.minimumRequirements === null).length,
    sinDescripcion: games.filter((r) => r.description === null).length,
    destino: rutaDestino,
  }, null, 2));

  console.log('\n=== GENEROS DE STEAM VISTOS (sin equivalencia se descartan) ===');
  console.log([...nombresSteam].sort().join(', '));

  console.log('\n=== AVISOS DE PREVALIDACION ===');
  if (!avisos.length) console.log('ninguno');
  for (const a of avisos) console.log('· ' + a);
}

main();
