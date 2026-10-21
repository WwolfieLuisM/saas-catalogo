import fs from 'node:fs';

// Fase D del plan de importacion: tamaños de PCGamingWiki SOLO para las filas que
// Steam no ha cubierto con storage (ni tiene appid, o su pc_requirements no publica
// Storage). RAWG/IGDB jamas dan tamaño, así que este es el ultimo respaldo automatico;
// lo que quede sin fuente se queda en null (visible en el aviso del dashboard).
//   node scripts/enriquecer-pcgw.mjs <filas.csv> <steam.json> <salida.json> [--limite N]
// Endpoints (docs/enriquecimiento-datos.md §2): la API está bajo /w/, busqueda por
// list=search y tamaño en wikitext como |minHD = 17 GB. Reanudable; guarda cada 25.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GUARDAR_CADA = 25;
const BASE_PCGW = 'https://www.pcgamingwiki.com/w/api.php';

function parseCsv(texto) {
  texto = texto.replace(/^﻿/, '');
  const filas = [];
  let fila = [], cur = '', q = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (q) {
      if (c === '"') { if (texto[i + 1] === '"') { cur += '"'; i++; } else q = false; }
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
}

function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\b(the|complete|edition|deluxe|ultimate|gold|goty|definitive|enhanced|remastered|special|premium|standard|legacy|bundle|collection|base game|juego base)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Para páginas de PCGW: los títulos suelen llevar el año entre paréntesis
// ("Syndicate (2012)"), que no es parte del nombre.
function normalizarPagina(s) {
  return normalizar(String(s || '').replace(/\b(19|20)\d{2}\b/g, ' '));
}

function similitud(a, b) {
  const A = normalizar(a).split(' ').filter(Boolean);
  const B = new Set(normalizar(b).split(' ').filter(Boolean));
  if (!A.length || !B.size) return 0;
  return A.filter((t) => B.has(t)).length / A.length;
}

// Bidireccional: "Pizza Syndicate" tendría 1.0 mirando solo la consulta, pero
// la mitad de sus términos no están en el título buscado.
function similitudPagina(titulo, pagina) {
  const A = normalizarPagina(titulo).split(' ').filter(Boolean);
  const B = normalizarPagina(pagina).split(' ').filter(Boolean);
  if (!A.length || !B.length) return 0;
  const aEnB = A.filter((t) => B.includes(t)).length / A.length;
  const bEnA = B.filter((t) => A.includes(t)).length / B.length;
  return Math.min(aEnB, bEnA);
}

// Segunda oportunidad de búsqueda: sin paréntesis ni sufijos de edición.
function tituloBasico(titulo) {
  return String(titulo)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(deluxe|complete|ultimate|definitive|remastered|goty|gold|enhanced|premium|standard|legacy|edition|bundle|collection|pack)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pcgw(params) {
  const url = `${BASE_PCGW}?${new URLSearchParams({ format: 'json', ...params })}`;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'saas-catalogo-enriquecimiento/1.0' } });
      if (r.status === 429) { await sleep(3000 * (intento + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(800 * (intento + 1));
    }
  }
  return null;
}

// |minHD = 17 GB  (preferido)  |recHD = ... (respaldo, avisando en notas)
function extraerHD(wikitext) {
  const conUnidad = /\|\s*(min|rec)HD\s*=\s*([^\n|]+)/gi;
  let mejor = null;
  let m;
  while ((m = conUnidad.exec(String(wikitext || '')))) {
    const campo = m[1].toLowerCase();
    const crudo = m[2].trim();
    const u = crudo.match(/([\d.,]+)\s*(GB|MB|TB)/i);
    if (!u) continue;
    const n = parseFloat(u[1].replace(',', '.'));
    if (!isFinite(n) || n <= 0) continue;
    const unidad = u[2].toUpperCase();
    const gb = unidad === 'MB' ? n / 1000 : unidad === 'TB' ? n * 1000 : n;
    if (gb < 0.01 || gb > 300) continue; // fuera de rango: no es un tamaño creíble de PC
    const candidato = { campo, crudo, gb: Math.round(gb * 1000) / 1000 };
    if (campo === 'min') return candidato;      // minHD manda
    if (!mejor) mejor = candidato;              // solo recHD disponible
  }
  return mejor;
}

async function buscarEnPcgw(texto) {
  const j = await pcgw({ action: 'query', list: 'search', srsearch: texto, srlimit: 5 });
  await sleep(300);
  const resultados = j?.query?.search ?? [];
  let mejor = null;
  for (const it of resultados) {
    const s = similitudPagina(texto, it.title);
    if (!mejor || s > mejor.similitud) mejor = { titulo: it.title, similitud: s };
  }
  return mejor;
}

async function buscarPagina(titulo) {
  let mejor = await buscarEnPcgw(titulo);
  if (!mejor || mejor.similitud < 0.6) {
    const basico = tituloBasico(titulo);
    if (basico && basico !== titulo) {
      const reintento = await buscarEnPcgw(basico);
      if (reintento && (!mejor || reintento.similitud > mejor.similitud)) mejor = reintento;
    }
  }
  return mejor;
}

async function traerWikitext(pagina) {
  const j = await pcgw({ action: 'parse', page: pagina, prop: 'wikitext' });
  await sleep(300);
  return j?.parse?.wikitext?.['*'] ?? null;
}

function main() {
  const [rutaFilas, rutaSteam, rutaSalida, ...resto] = process.argv.slice(2);
  if (!rutaFilas || !rutaSteam || !rutaSalida) {
    console.error('Uso: node scripts/enriquecer-pcgw.mjs <filas.csv> <steam.json> <salida.json> [--limite N]');
    process.exit(2);
  }
  const limiteIdx = resto.indexOf('--limite');
  const limite = limiteIdx >= 0 ? Number(resto[limiteIdx + 1]) : Infinity;

  const filas = parseCsv(fs.readFileSync(rutaFilas, 'utf8'));
  const steamPorId = new Map((JSON.parse(fs.readFileSync(rutaSteam, 'utf8')).registros ?? []).map((r) => [r.id, r]));

  let previos = [];
  try {
    previos = JSON.parse(fs.readFileSync(rutaSalida, 'utf8')).registros ?? [];
  } catch { /* primera pasada */ }
  const hechos = new Map(previos.map((r) => [r.id, r]));

  // Necesita PCGW: sin fila Steam, o Steam sin storage publicado.
  const pendientes = filas.filter((f) => {
    if (hechos.has(f.id)) return false;
    const s = steamPorId.get(f.id);
    return !s || !s.steam_appid || !s.size_gb;
  }).slice(0, limite);

  const resumen = { pagina: 0, conSize: 0, sinCoincidencia: 0, sinHD: 0 };

  const guardar = () => {
    const registros = filas.map((f) => hechos.get(f.id)).filter(Boolean);
    fs.writeFileSync(rutaSalida, JSON.stringify({
      generado: new Date().toISOString(),
      fuente: 'pcgamingwiki.com/w/api.php (minHD/recHD; confidence < 1 = aproximado)',
      registros,
    }, null, 2), 'utf8');
  };

  let procesadas = 0;
  const promesa = (async () => {
    for (const fila of pendientes) {
      const titulo = fila.ganador || fila.titulo_limpio;
      const r = {
        id: fila.id,
        titulo: fila.titulo_limpio,
        pagina: null,
        url: null,
        size_gb: null,
        campo_hd: null,
        confidence: 0.9,
        notas: null,
        estado: 'SIN_PCGW',
        detalle: '',
      };
      hechos.set(r.id, r);

      const mejor = await buscarPagina(titulo);
      if (!mejor || mejor.similitud < 0.6) {
        r.detalle = mejor
          ? `mejor pagina "${mejor.titulo}" con similitud ${mejor.similitud.toFixed(2)} (< 0.60)`
          : 'sin pagina en PCGamingWiki';
        resumen.sinCoincidencia++;
      } else {
        r.pagina = mejor.titulo;
        r.url = `https://www.pcgamingwiki.com/wiki/${mejor.titulo.replace(/ /g, '_')}`;
        resumen.pagina++;

        const wikitext = await traerWikitext(mejor.titulo);
        const hd = wikitext ? extraerHD(wikitext) : null;
        if (!hd) {
          r.estado = 'SIN_HD';
          r.detalle = wikitext ? 'la pagina no publica minHD/recHD' : 'wikitext no disponible';
          resumen.sinHD++;
        } else {
          r.size_gb = hd.gb;
          r.campo_hd = hd.campo === 'min' ? 'minHD' : 'recHD';
          r.estado = 'OK';
          const apunte = hd.campo === 'min' ? '' : ' (solo publicaba recHD, el valor recomendado)';
          r.notas = `Tamano ${hd.gb} GB tomado de ${r.campo_hd} de PCGamingWiki${apunte}; puede no incluir DLC o mods. Fuente: ${r.url}`;
          r.detalle = `${r.campo_hd} = ${hd.crudo}`;
          resumen.conSize++;
        }
      }

      procesadas++;
      if (procesadas % GUARDAR_CADA === 0) {
        guardar();
        console.log(`[${procesadas}/${pendientes.length}] pagina=${resumen.pagina} size=${resumen.conSize} sinHD=${resumen.sinHD}`);
      }
    }
    guardar();
  })();

  promesa.then(() => {
    console.log('\n=== RESUMEN FASE D (PCGW) ===');
    console.log(JSON.stringify({
      filasCsv: filas.length,
      yaHechas: hechos.size - pendientes.length,
      nuevas: pendientes.length,
      con_pagina: resumen.pagina,
      con_size: resumen.conSize,
      sin_hoja_hd: resumen.sinHD,
      sin_coincidencia: resumen.sinCoincidencia,
      salida: rutaSalida,
    }, null, 2));
  });
}

main();
