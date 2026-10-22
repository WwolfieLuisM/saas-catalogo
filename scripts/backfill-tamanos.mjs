// Fase G1: motor de dos pasadas para recuperar los tamaños de los juegos del
// lote 1 que quedaron sin tamaño (96; starless-abyss queda fuera por diseño).
//
// Pasada 1 (misma edición, confidence 0.9): Steam (appid del registro o
// storesearch por título) y, si no, página PCGW estricta por título completo.
// Pasada 2 (juego base, confidence 0.6): PCGW con título básico y, si no,
// Steam con storesearch por título básico. Las notas de juego-base citan siempre
// la página o el nombre usado, para que la provenance sea revisable.
//
// Sin fuente en ninguna pasada → size_gb: null y detalle 'sin fuente'
// (residual para el Task 3). Nunca se estiman tamaños.
//
// Uso: node scripts/backfill-tamanos.mjs [--limite N]
// Salida (gitignored): backend/scripts/backfill-tamanos.json
// Reanudable: los slugs ya presentes en la salida no se vuelven a consultar.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const GUARDAR_CADA = 25;
const SALIDA = 'backend/scripts/backfill-tamanos.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Helpers copiados de enriquecer-steam.mjs (fase B, sin modificarlos) ──

function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\b(the|complete|edition|deluxe|ultimate|gold|goty|definitive|enhanced|remastered|special|premium|standard|legacy|bundle|collection|base game|juego base)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function similitud(a, b) {
  const A = normalizar(a).split(' ').filter(Boolean);
  const B = new Set(normalizar(b).split(' ').filter(Boolean));
  if (!A.length || !B.size) return 0;
  return A.filter((t) => B.has(t)).length / A.length;
}

function textoPlano(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// Homoglifos cirilicos tecleados sin querer en requisitos (la X de "x64" en un
// teclado ruso). Claves por code point: cero cirilico literal en el codigo.
const HOMoglifos = Object.fromEntries(
  [
    [0x0430, 'a'], [0x0435, 'e'], [0x0451, 'e'], [0x043e, 'o'], [0x0440, 'p'],
    [0x0441, 'c'], [0x0443, 'y'], [0x0445, 'x'], [0x0456, 'i'],
    [0x0410, 'A'], [0x0412, 'B'], [0x0415, 'E'], [0x0401, 'E'], [0x041a, 'K'],
    [0x041c, 'M'], [0x041d, 'H'], [0x041e, 'O'], [0x0420, 'P'], [0x0421, 'C'],
    [0x0422, 'T'], [0x0425, 'X'], [0x0423, 'Y'],
  ].map(([codigo, letra]) => [String.fromCharCode(codigo), letra]),
);
function homoglifos(t) {
  let salida = '';
  for (const c of String(t)) salida += HOMoglifos[c] ?? c;
  return salida;
}

function extraerRequisitos(htmlRequisitos) {
  const texto = homoglifos(textoPlano(htmlRequisitos)).replace(/\s*\*\s*:/g, ':').replace(/\s*:\s*/g, ': ');
  if (!texto) return null;
  const campo = (etiquetas) => {
    for (const e of etiquetas) {
      const m = texto.match(new RegExp(`\\b${e}\\s*:\\s*([^\\n]{1,150})`, 'i'));
      if (m) return m[1].trim().replace(/\s*\*\s*/g, ' ').slice(0, 150);
    }
    return undefined;
  };
  const salida = {
    os: campo(['Sistema operativo', 'SO', 'OS']),
    cpu: campo(['Procesador', 'Processor']),
    gpu: campo(['Gr.ficos', 'Tarjeta gr.fica', 'Tarjeta de v.deo', 'Graphics']),
    ram: campo(['Memoria', 'Memory']),
    storage: campo(['Almacenamiento', 'Disco duro', 'Espacio en disco', 'Storage', 'Hard Drive']),
  };
  return Object.values(salida).every((v) => v === undefined) ? null : salida;
}

const LIMITES = { cpu: 150, gpu: 150, ram: 50, os: 100, directX: 50, storage: 100 };

function recortar(valor, max) {
  const v = String(valor);
  if (v.length <= max) return v;
  const corte = v.slice(0, max);
  let fin = -1;
  for (const c of [',', ';', '.', ' y ']) {
    const i = corte.lastIndexOf(c);
    if (i > max * 0.4 && i + c.length > fin) fin = i + c.length;
  }
  return (fin > 0 ? corte.slice(0, fin) : corte).trim().replace(/[\s,;.\-]+$/, '');
}

function limpiarRequisitos(req) {
  if (!req) return null;
  const salida = {};
  for (const [k, v] of Object.entries(req)) {
    if (v == null || v === '') continue;
    salida[k] = LIMITES[k] != null ? recortar(v, LIMITES[k]) : String(v);
  }
  return Object.keys(salida).length ? salida : null;
}

function extraerStorage(requisitos) {
  if (!requisitos) return null;
  const m = String(requisitos).match(/([\d.,]+)\s*(GB|MB|TB)/i);
  if (!m) return null;
  const n = parseFloat(String(m[1]).replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  const unidad = m[2].toUpperCase();
  const gb = unidad === 'MB' ? n / 1000 : unidad === 'TB' ? n * 1000 : n;
  const redondeado = Math.round(gb * 10000) / 10000;
  return redondeado > 0 ? redondeado : null;
}

// Steam con fetch inyectable (ctx) y contador de consultas para el resumen.
async function steamJson(url, ctx) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      ctx.consultas += 1;
      const r = await ctx.fetchImpl(url, { headers: { accept: 'application/json' } });
      if (r.status === 429) { await sleep(3000 * (intento + 1)); continue; }
      if (!r.ok) return null;
      const datos = await r.json();
      await sleep(300);
      return datos;
    } catch {
      await sleep(800 * (intento + 1));
    }
  }
  return null;
}

async function buscarAppId(titulo, ctx) {
  const j = await steamJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(titulo)}&l=english&cc=US`, ctx);
  let mejor = null;
  for (const it of j?.items || []) {
    if (it.type !== 'app') continue;
    const s = similitud(titulo, it.name);
    if (!mejor || s > mejor.similitud) mejor = { id: it.id, nombre: it.name, similitud: s };
  }
  // El plan exige similitud >= 0.6 para aceptar el appid.
  return mejor && mejor.similitud >= 0.6 ? mejor : null;
}

async function traerApp(appId, lang, ctx) {
  const j = await steamJson(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=${lang}&cc=US`, ctx);
  const app = j?.[String(appId)];
  return app?.success ? app.data : null;
}

// ── Helpers copiados de enriquecer-pcgw.mjs (fase D, sin modificarlos) ──

const BASE_PCGW = 'https://www.pcgamingwiki.com/w/api.php';

function normalizarPagina(s) {
  return normalizar(String(s || '').replace(/\b(19|20)\d{2}\b/g, ' '));
}

function similitudPagina(titulo, pagina) {
  const A = normalizarPagina(titulo).split(' ').filter(Boolean);
  const B = normalizarPagina(pagina).split(' ').filter(Boolean);
  if (!A.length || !B.length) return 0;
  const aEnB = A.filter((t) => B.includes(t)).length / A.length;
  const bEnA = B.filter((t) => A.includes(t)).length / B.length;
  return Math.min(aEnB, bEnA);
}

function tituloBasico(titulo) {
  return String(titulo)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(deluxe|complete|ultimate|definitive|remastered|goty|gold|enhanced|premium|standard|legacy|edition|bundle|collection|pack)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pcgw(params, ctx) {
  const url = `${BASE_PCGW}?${new URLSearchParams({ format: 'json', ...params })}`;
  for (let intento = 0; intento < 3; intento++) {
    try {
      ctx.consultas += 1;
      const r = await ctx.fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': 'saas-catalogo-enriquecimiento/1.0' } });
      if (r.status === 429) { await sleep(3000 * (intento + 1)); continue; }
      if (!r.ok) return null;
      const datos = await r.json();
      await sleep(300);
      return datos;
    } catch {
      await sleep(800 * (intento + 1));
    }
  }
  return null;
}

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
    if (gb < 0.01 || gb > 300) continue;
    const candidato = { campo, crudo, gb: Math.round(gb * 1000) / 1000 };
    if (campo === 'min') return candidato;
    if (!mejor) mejor = candidato;
  }
  return mejor;
}

async function buscarEnPcgw(titulo, ctx) {
  const j = await pcgw({ action: 'query', list: 'search', srsearch: titulo, srlimit: 5 }, ctx);
  await sleep(300);
  const resultados = j?.query?.search ?? [];
  let mejor = null;
  for (const it of resultados) {
    const s = similitudPagina(titulo, it.title);
    if (!mejor || s > mejor.similitud) mejor = { titulo: it.title, similitud: s };
  }
  return mejor;
}

async function traerWikitext(pagina, ctx) {
  const j = await pcgw({ action: 'parse', page: pagina, prop: 'wikitext' }, ctx);
  await sleep(300);
  return j?.parse?.wikitext?.['*'] ?? null;
}

// Busqueda estricta: una sola consulta al titulo tal cual, sin el reintento
// interno con tituloBasico que hace buscarPagina() en fase D. El reintento vive
// en la pasada 2, para que una pagina base no entre en la pasada 1 y se
// etiquete mal (misma-edicion cuando el tamaño es del juego base).
async function buscarPaginaEstricta(titulo, ctx) {
  const mejor = await buscarEnPcgw(titulo, ctx);
  return mejor && mejor.similitud >= 0.6 ? mejor : null;
}

// ── Etiquetado de provenance ──

// Sufijos de edicion en el TITULO del registro: si el nombre casado no los
// conserva, el tamaño publicado es del juego base (0.6 con notas).
const EDICION = /\b(deluxe|definitive|complete|ultimate|gold|goty|overkill|apex|komplete|premium|enhanced|remastered|special|collection|bundle|pack|edition|edicion)\b/gi;

function esEdicionBase(titulo, nombre) {
  const tokens = String(titulo).toLowerCase().match(EDICION) ?? [];
  if (!tokens.length) return false;
  const n = String(nombre || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return !tokens.some((t) => n.includes(t));
}

function construir(encabezado, j, pasada, size_gb, fuente, url, nombre, detalle) {
  // La pasada 2 siempre es juego base; en la pasada 1 deciden los tokens de
  // edicion (similitudPagina normaliza quitando palabras de edicion, asi que
  // en el mundo real un titulo Deluxe casaria la pagina base con 1.0).
  const esBase = pasada === 2 || esEdicionBase(j.title, nombre);
  return {
    ...encabezado,
    size_gb,
    fuente,
    url,
    confidence: esBase ? 0.6 : 0.9,
    modo: esBase ? 'juego-base' : 'misma-edicion',
    notas: esBase ? `tamaño publicado en la edición base «${nombre}»` : '',
    detalle,
  };
}

async function sizeDeAppid(appid, ctx) {
  const app = await traerApp(appid, 'english', ctx);
  if (!app) return null;
  const min = limpiarRequisitos(extraerRequisitos(app?.pc_requirements?.minimum));
  const rec = limpiarRequisitos(extraerRequisitos(app?.pc_requirements?.recommended));
  return extraerStorage(min?.storage) ?? extraerStorage(rec?.storage) ?? null;
}

const urlSteam = (appid) => `https://store.steampowered.com/app/${appid}`;
const urlWiki = (pagina) => `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(String(pagina).replace(/\s+/g, '_'))}`;

// ── Núcleo (lo prueba scripts/backfill-tamanos.test.mjs) ──

async function procesarUno(j, steam, ctx) {
  const encabezado = { id: steam?.id ?? null, slug: j.slug, titulo: j.title };

  // Pasada 1a: Steam
  let appid = steam?.steam_appid ?? null;
  let nombreSteam = steam?.steam_nombre ?? null;
  if (appid) {
    const gb = await sizeDeAppid(appid, ctx);
    if (gb != null) return construir(encabezado, j, 1, gb, 'Steam', urlSteam(appid), nombreSteam ?? '', 'pasada 1 steam');
  } else {
    const b = await buscarAppId(j.title, ctx);
    if (b) {
      const gb = await sizeDeAppid(b.id, ctx);
      if (gb != null) return construir(encabezado, j, 1, gb, 'Steam', urlSteam(b.id), b.nombre, 'pasada 1 steam');
    }
  }

  // Pasada 1b: PCGW estricta por título completo
  const p1 = await buscarPaginaEstricta(j.title, ctx);
  if (p1) {
    const wikitext = await traerWikitext(p1.titulo, ctx);
    const hd = wikitext ? extraerHD(wikitext) : null;
    if (hd) return construir(encabezado, j, 1, hd.gb, 'PCGamingWiki', urlWiki(p1.titulo), p1.titulo, 'pasada 1 pcgw');
  }

  const basico = tituloBasico(j.title);
  if (basico && basico !== j.title) {
    // Pasada 2a: PCGW con el título básico (juego base)
    const p2 = await buscarPaginaEstricta(basico, ctx);
    if (p2) {
      const wikitext = await traerWikitext(p2.titulo, ctx);
      const hd = wikitext ? extraerHD(wikitext) : null;
      if (hd) return construir(encabezado, j, 2, hd.gb, 'PCGamingWiki', urlWiki(p2.titulo), p2.titulo, 'pasada 2 pcgw');
    }
    // Pasada 2b: Steam con storesearch del título básico
    const b2 = await buscarAppId(basico, ctx);
    if (b2) {
      const gb = await sizeDeAppid(b2.id, ctx);
      if (gb != null) return construir(encabezado, j, 2, gb, 'Steam', urlSteam(b2.id), b2.nombre, 'pasada 2 steam');
    }
  }

  return { ...encabezado, size_gb: null, fuente: null, url: null, confidence: null, modo: null, notas: '', detalle: 'sin fuente' };
}

export async function procesar({ juegos, steamIdx, pcgwIdx = new Map(), previos = [], fetchImpl = globalThis.fetch, limite, cada25 }) {
  const ctx = { fetchImpl, consultas: 0 };
  const hechos = new Map(previos.map((p) => [p.slug, p]));
  const registros = [];
  let nuevos = 0;
  for (const j of juegos) {
    const previo = hechos.get(j.slug);
    if (previo) { registros.push(previo); continue; }
    if (limite != null && nuevos >= limite) continue;
    const steam = steamIdx.get(j.title) ?? null;
    const r = await procesarUno(j, steam, ctx);
    registros.push(r);
    hechos.set(j.slug, r);
    nuevos += 1;
    if (cada25 && nuevos % GUARDAR_CADA === 0) await cada25(registros);
  }
  return { registros, consultas: ctx.consultas };
}

// ── CLI ──

function guardar(registros) {
  const cuerpo = {
    generado: new Date().toISOString(),
    fuente: 'backfill fase G1: Steam + PCGamingWiki',
    registros,
  };
  writeFileSync(SALIDA, JSON.stringify(cuerpo, null, 2), 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const pos = args.indexOf('--limite');
  const limite = pos >= 0 ? Number(args[pos + 1]) : undefined;

  const lote1 = JSON.parse(readFileSync('tasks/library-import-lote1.json', 'utf8'));
  const juegos = (lote1.games ?? []).filter((g) => g.sizeValue == null);
  const steamRegistros = JSON.parse(readFileSync('backend/scripts/steam-lote1.json', 'utf8')).registros ?? [];
  const pcgwRegistros = JSON.parse(readFileSync('backend/scripts/pcgw-lote1.json', 'utf8')).registros ?? [];
  const steamIdx = new Map(steamRegistros.map((r) => [r.titulo, r]));
  const pcgwIdx = new Map(pcgwRegistros.map((r) => [r.id, r]));

  let previos = [];
  try {
    previos = JSON.parse(readFileSync(SALIDA, 'utf8')).registros ?? [];
  } catch {
    previos = [];
  }

  if (juegos.length !== 96) console.log(`aviso: se esperaban 96 sin tamaño en lote1 y hay ${juegos.length}`);

  const { registros, consultas } = await procesar({
    juegos, steamIdx, pcgwIdx, previos, limite, cada25: guardar,
  });
  guardar(registros);

  const recuperados = registros.filter((r) => r.size_gb != null);
  const residuales = registros.filter((r) => r.detalle === 'sin fuente');
  const pendientes = juegos.length - registros.length;
  const desglose = {};
  for (const r of recuperados) {
    const clave = `${r.modo} · ${r.fuente}`;
    desglose[clave] = (desglose[clave] ?? 0) + 1;
  }

  console.log(`sin tamaño en lote1: ${juegos.length} | previos: ${previos.length} | nuevos en esta corrida: ${registros.length - previos.length}${limite != null ? ` | limite: ${limite}` : ''}`);
  console.log(`recuperados: ${recuperados.length} | residuales: ${residuales.length} | total en salida: ${registros.length}`);
  console.log(`pendientes: ${pendientes}`);
  console.log(`${consultas} consultas nuevas`);
  console.log(JSON.stringify(desglose, null, 2));
}

const esCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esCli) await main();
