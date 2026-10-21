import fs from 'node:fs';

// Fase B3 del plan de importacion: respaldo RAWG SOLO para las filas que Steam no
// ha cubierto (sin steam_appid en el fichero de enriquecimiento).
//   node scripts/enriquecer-rawg.mjs <filas.csv> <steam.json> <salida.json> [--limite N]
// Reanudable igual que enriquecer-steam.mjs: lo que ya esta en <salida.json> no se
// vuelve a consultar; se guarda cada 25 filas. Clave RAWG en .env (raiz o backend/).
// Atribucion obligatoria: https://rawg.io (queda en el envelope del constructor).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GUARDAR_CADA = 25;

// Generos oficiales de RAWG -> diccionario global del proyecto.
const GENRE_MAP = {
  Action: 'accion',
  RPG: 'rol',
  Shooter: 'disparos',
  Adventure: 'aventura',
  Puzzle: 'puzzle',
  Platform: 'plataformas',
  Racing: 'carreras',
  Sports: 'deportes',
  Indie: 'indie',
  Strategy: 'estrategia',
  Simulation: 'simulacion',
  Fighting: 'lucha',
  Card: 'cartas-y-mesa',
  'Board Game': 'cartas-y-mesa',
  Casual: 'casual',
  Arcade: 'arcade',
};

function leerClave(ruta) {
  try {
    const texto = fs.readFileSync(ruta, 'utf8');
    const linea = texto.split(/\r?\n/).find((l) => /^RAWG_API_KEY\s*=/.test(l));
    if (!linea) return '';
    return linea.replace(/^RAWG_API_KEY\s*=\s*/, '').trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

function cargarClave() {
  const candidatas = [
    new URL('../.env', import.meta.url),          // raiz del repo
    new URL('../backend/.env', import.meta.url),  // donde la dejaron los scripts del piloto
  ];
  for (const ruta of candidatas) {
    const valor = leerClave(ruta);
    if (valor) return valor;
  }
  return process.env.RAWG_API_KEY || '';
}

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

function cortar(html, max) {
  const t = textoPlano(html);
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('\n'));
  return (fin > max * 0.5 ? corte.slice(0, fin + 1) : corte.trimEnd()).trim();
}

// \b imprescindible: sin el, /OS:/ casaria dentro de "Graficos:".
function extraerRequisitos(htmlRequisitos) {
  const texto = textoPlano(htmlRequisitos).replace(/\s*\*\s*:/g, ':').replace(/\s*:\s*/g, ': ');
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
    cpu: campo(['Procesador', 'Processor', 'CPU']),
    gpu: campo(['Gr.ficos', 'Tarjeta gr.fica', 'Tarjeta de v.deo', 'Graphics', 'GPU']),
    ram: campo(['Memoria', 'Memory', 'RAM']),
    storage: campo(['Almacenamiento', 'Disco duro', 'Espacio en disco', 'Storage', 'Hard Drive']),
  };
  return Object.values(salida).every((v) => v === undefined) ? null : salida;
}

function extraerStorage(campo) {
  if (!campo) return null;
  const m = String(campo).match(/([\d.,]+)\s*(GB|MB|TB)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  const u = m[2].toUpperCase();
  const gb = u === 'MB' ? n / 1000 : u === 'TB' ? n * 1000 : n;
  return Math.round(gb * 100) / 100;
}

async function rawg(url, clave) {
  const separador = url.includes('?') ? '&' : '?';
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(`${url}${separador}key=${encodeURIComponent(clave)}`, {
        headers: { accept: 'application/json' },
      });
      if (r.status === 429) { await sleep(4000 * (intento + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(800 * (intento + 1));
    }
  }
  return null;
}

function main() {
  const [rutaFilas, rutaSteam, rutaSalida, ...resto] = process.argv.slice(2);
  if (!rutaFilas || !rutaSteam || !rutaSalida) {
    console.error('Uso: node scripts/enriquecer-rawg.mjs <filas.csv> <steam.json> <salida.json> [--limite N]');
    process.exit(2);
  }
  const limiteIdx = resto.indexOf('--limite');
  const limite = limiteIdx >= 0 ? Number(resto[limiteIdx + 1]) : Infinity;

  const clave = cargarClave();
  if (!clave) {
    console.error('Falta RAWG_API_KEY. Anadela a .env (raiz o backend/) y vuelve a lanzar.');
    process.exit(1);
  }

  const filas = parseCsv(fs.readFileSync(rutaFilas, 'utf8'));
  const conSteam = new Set((JSON.parse(fs.readFileSync(rutaSteam, 'utf8')).registros ?? [])
    .filter((r) => r.steam_appid).map((r) => r.id));

  let previos = [];
  try {
    previos = JSON.parse(fs.readFileSync(rutaSalida, 'utf8')).registros ?? [];
  } catch { /* primera pasada */ }
  const hechos = new Map(previos.map((r) => [r.id, r]));
  const pendientes = filas.filter((f) => !hechos.has(f.id) && !conSteam.has(f.id)).slice(0, limite);

  const resumen = { rawgId: 0, conDesc: 0, conGen: 0, conReq: 0, conSize: 0, sinCoincidencia: 0 };

  const guardar = () => {
    const registros = filas.map((f) => hechos.get(f.id)).filter(Boolean);
    fs.writeFileSync(rutaSalida, JSON.stringify({
      generado: new Date().toISOString(),
      fuente: 'rawg.io (atribucion obligatoria segun los terminos de RAWG)',
      registros,
    }, null, 2), 'utf8');
  };

  let procesadas = 0;
  const promesa = (async () => {
    for (const fila of pendientes) {
      const titulo = fila.titulo_limpio;
      const anio = Number(fila.anio) || null;
      const r = {
        id: fila.id,
        titulo,
        anio,
        portada: fila.portada || null,
        igdb_url: fila.ganador_url || null,
        rawg_id: null,
        rawg_nombre: null,
        rawg_slug: null,
        similitud: null,
        descripcion: null,
        developer: null,
        publisher: null,
        generos: [],
        size_gb: null,
        requisitos_min: null,
        requisitos_rec: null,
        estado: 'SIN_RAWG',
        detalle: '',
      };
      hechos.set(r.id, r);

      const busqueda = await rawg(`https://api.rawg.io/api/games?search=${encodeURIComponent(fila.ganador || titulo)}&page_size=10`, clave);
      await sleep(300);

      let mejor = null;
      for (const it of busqueda?.results || []) {
        const s = similitud(titulo, it.name);
        const anioOk = !anio || !it.released ? 0.05 : Math.abs(Number(it.released.slice(0, 4)) - anio) <= 1 ? 0.05 : -0.25;
        const puntuacion = s + anioOk;
        if (!mejor || puntuacion > mejor.puntuacion) {
          mejor = { id: it.id, nombre: it.name, slug: it.slug, similitud: s, puntuacion };
        }
      }

      if (!mejor || mejor.similitud < 0.6) {
        r.detalle = mejor
          ? `mejor candidato "${mejor.nombre}" con similitud ${mejor.similitud.toFixed(2)} (< 0.60)`
          : 'sin coincidencia en la busqueda de RAWG';
        resumen.sinCoincidencia++;
      } else {
        const det = await rawg(`https://api.rawg.io/api/games/${mejor.id}`, clave);
        await sleep(300);
        if (!det) {
          r.detalle = 'el detalle de RAWG no devolvio datos';
        } else {
          r.rawg_id = det.id;
          r.rawg_nombre = det.name;
          r.rawg_slug = det.slug;
          r.similitud = Number(mejor.similitud.toFixed(2));
          r.descripcion = cortar(det.description_raw || det.description, 2000) || null;
          r.developer = (det.developers || []).map((d) => d.name).join(', ').slice(0, 150) || null;
          r.publisher = (det.publishers || []).map((p) => p.name).join(', ').slice(0, 150) || null;
          r.generos = [...new Set((det.genres || []).map((g) => GENRE_MAP[g.name]).filter(Boolean))];
          r.requisitos_min = extraerRequisitos(det.requirements?.minimum);
          r.requisitos_rec = extraerRequisitos(det.requirements?.recommended) ?? r.requisitos_min;
          r.size_gb = extraerStorage(r.requisitos_min?.storage) ?? extraerStorage(r.requisitos_rec?.storage);

          r.estado = r.descripcion ? (r.size_gb ? 'OK' : 'SIN_TAMANO') : 'SIN_DESCRIPCION';
          r.detalle = r.size_gb
            ? `Storage RAWG: ${r.requisitos_min?.storage ?? r.requisitos_rec?.storage}`
            : 'RAWG no publica tamano de instalacion';
          resumen.rawgId++;
          if (r.descripcion) resumen.conDesc++;
          if (r.generos.length) resumen.conGen++;
          if (r.requisitos_min) resumen.conReq++;
          if (r.size_gb) resumen.conSize++;
        }
      }

      procesadas++;
      if (procesadas % GUARDAR_CADA === 0) {
        guardar();
        console.log(`[${procesadas}/${pendientes.length}] rawg=${resumen.rawgId} sinCoincidencia=${resumen.sinCoincidencia}`);
      }
    }
    guardar();
  })();

  promesa.then(() => {
    console.log('\n=== RESUMEN FASE B (RAWG) ===');
    console.log(JSON.stringify({
      filasCsv: filas.length,
      cubiertasPorSteam: conSteam.size,
      sinSteamProcesadas: pendientes.length,
      con_rawg_id: resumen.rawgId,
      con_descripcion: resumen.conDesc,
      con_generos: resumen.conGen,
      con_requisitos: resumen.conReq,
      con_size: resumen.conSize,
      sin_coincidencia: resumen.sinCoincidencia,
      salida: rutaSalida,
    }, null, 2));
  });
}

main();
