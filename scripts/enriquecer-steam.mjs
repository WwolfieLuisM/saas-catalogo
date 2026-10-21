import fs from 'node:fs';

// Fase B del plan de importacion: enriquece un CSV con formato piloto contra la
// Steam store, en una sola pasada y reanudable.
//   node scripts/enriquecer-steam.mjs <filas.csv> <salida.json> [--limite N]
// Por fila:
//   1) storesearch (l=english) con verificacion de similitud >= 0.6
//   2) appdetails l=english  -> descripcion EN, generos EN, requisitos EN, size
//   3) appdetails l=spanish  -> descripcion y requisitos en espanol (el catalogo es ES)
//   4) portada Steam 600x900 (HEAD contra los hosts de COVER_ALLOWED_HOSTS)
// Reanudable: lo que ya figura en <salida.json> no se vuelve a consultar.
// Se guarda el fichero cada 25 filas para poder cortar sin perder nada.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GUARDAR_CADA = 25;

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

// Rótulos en ambos idiomas: Steam devuelve el idioma de `l` y el catalogo es ES.
function extraerRequisitos(htmlRequisitos) {
  // "SO *:" (asterisco de nota) se normaliza a "SO:" para poder casar el rotulo.
  const texto = textoPlano(htmlRequisitos).replace(/\s*\*\s*:/g, ':').replace(/\s*:\s*/g, ': ');
  if (!texto) return null;
  const campo = (etiquetas) => {
    for (const e of etiquetas) {
      // \b es imprescindible: sin el, /OS:/ casa dentro de "Graficos:".
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

// Limites de strictRequirementsSchema; el texto de Steam (sobre todo en espanol)
// se pasa de ellos.
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

async function steamJson(url) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.status === 429) { await sleep(3000 * (intento + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(800 * (intento + 1));
    }
  }
  return null;
}

async function buscarAppId(titulo) {
  const j = await steamJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(titulo)}&l=english&cc=US`);
  let mejor = null;
  for (const it of j?.items || []) {
    if (it.type !== 'app') continue;
    const s = similitud(titulo, it.name);
    if (!mejor || s > mejor.similitud) mejor = { id: it.id, nombre: it.name, similitud: s };
  }
  return mejor;
}

async function traerApp(appId, lang) {
  const j = await steamJson(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=${lang}&cc=US`);
  const app = j?.[String(appId)];
  return app?.success ? app.data : null;
}

// hosts ya permitidos por COVER_ALLOWED_HOSTS de library-import.media.ts
const PORTADAS = (id) => [
  `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`,
  `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`,
];

async function existeImagen(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (r.ok) return true;
    if (r.status === 405 || r.status === 501) {
      const g = await fetch(url, { headers: { range: 'bytes=0-64' } });
      return g.ok;
    }
    return false;
  } catch {
    return false;
  }
}

function main() {
  const [rutaFilas, rutaSalida, ...resto] = process.argv.slice(2);
  if (!rutaFilas || !rutaSalida) {
    console.error('Uso: node scripts/enriquecer-steam.mjs <filas.csv> <salida.json> [--limite N]');
    process.exit(2);
  }
  const limiteIdx = resto.indexOf('--limite');
  const limite = limiteIdx >= 0 ? Number(resto[limiteIdx + 1]) : Infinity;

  const filas = parseCsv(fs.readFileSync(rutaFilas, 'utf8'));

  // Reanudacion: lo que ya esta en la salida no se consulta otra vez.
  let previos = [];
  try {
    previos = JSON.parse(fs.readFileSync(rutaSalida, 'utf8')).registros ?? [];
  } catch { /* primera pasada */ }
  const hechos = new Map(previos.map((r) => [r.id, r]));
  const pendientes = filas.filter((f) => !hechos.has(f.id)).slice(0, limite);

  const resumen = { appid: 0, ok: 0, sinTamano: 0, sinSteam: 0, sinDetalle: 0, descEs: 0, reqEs: 0, portada: 0 };

  const guardar = () => {
    const registros = filas.map((f) => hechos.get(f.id)).filter(Boolean);
    fs.writeFileSync(rutaSalida, JSON.stringify({
      generado: new Date().toISOString(),
      fuente: `${rutaFilas} + store.steampowered.com/api (appdetails l=english y l=spanish)`,
      consultas_steam: registros.filter((r) => r.steam_appid).length,
      registros,
    }, null, 2), 'utf8');
  };

  let procesadas = 0;
  const promesa = (async () => {
    for (const fila of pendientes) {
      const tituloSteam = fila.ganador || fila.titulo_limpio;
      const registro = {
        id: fila.id,
        titulo: fila.titulo_limpio,
        titulo_steam: tituloSteam,
        anio: Number(fila.anio) || null,
        portada: fila.portada || null,
        igdb_url: fila.ganador_url || null,
        steam_appid: null,
        steam_nombre: null,
        similitud: null,
        descripcion: null,
        descripcion_es: null,
        developer: null,
        publisher: null,
        keywords_steam: null,
        generos_steam: [],
        size_gb: null,
        requisitos_min: null,
        requisitos_rec: null,
        requisitos_min_es: null,
        requisitos_rec_es: null,
        portada_steam: null,
        estado: 'SIN_STEAM',
        detalle: '',
      };
      hechos.set(registro.id, registro);

      const encontrado = await buscarAppId(tituloSteam);
      await sleep(300);
      if (!encontrado || encontrado.similitud < 0.6) {
        registro.detalle = encontrado
          ? `mejor candidato "${encontrado.nombre}" con similitud ${encontrado.similitud.toFixed(2)} (< 0.60)`
          : 'sin coincidencia en Steam storesearch';
        resumen.sinSteam++;
      } else {
        registro.steam_appid = encontrado.id;
        registro.steam_nombre = encontrado.nombre;
        registro.similitud = Number(encontrado.similitud.toFixed(2));
        resumen.appid++;

        const det = await traerApp(encontrado.id, 'english');
        await sleep(300);
        if (!det) {
          registro.estado = 'SIN_DETALLE';
          registro.detalle = 'appdetails no devolvio success';
          resumen.sinDetalle++;
        } else {
          registro.descripcion = cortar(det.short_description, 1200);
          registro.developer = (det.developers || []).join(', ').slice(0, 150) || null;
          registro.publisher = (det.publishers || []).join(', ').slice(0, 150) || null;
          registro.generos_steam = (det.genres || []).map((g) => g.description);
          registro.keywords_steam = registro.generos_steam.join(', ').slice(0, 500) || null;

          const min = limpiarRequisitos(extraerRequisitos(det.pc_requirements?.minimum));
          const rec = limpiarRequisitos(extraerRequisitos(det.pc_requirements?.recommended)) ?? min;
          registro.requisitos_min = min;
          registro.requisitos_rec = rec;
          registro.size_gb = extraerStorage(min?.storage) ?? extraerStorage(rec?.storage);

          const detEs = await traerApp(encontrado.id, 'spanish');
          await sleep(300);
          if (detEs) {
            registro.descripcion_es = cortar(detEs.short_description, 1200) || null;
            const minEs = limpiarRequisitos(extraerRequisitos(detEs.pc_requirements?.minimum));
            const recEs = limpiarRequisitos(extraerRequisitos(detEs.pc_requirements?.recommended)) ?? minEs;
            registro.requisitos_min_es = minEs;
            registro.requisitos_rec_es = recEs;
            if (registro.descripcion_es) resumen.descEs++;
            if (registro.requisitos_min_es) resumen.reqEs++;
          }

          for (const url of PORTADAS(encontrado.id)) {
            if (await existeImagen(url)) { registro.portada_steam = url; resumen.portada++; break; }
            await sleep(200);
          }

          if (registro.size_gb) {
            registro.estado = 'OK';
            registro.detalle = `Storage Steam: ${min?.storage ?? rec?.storage}`;
            resumen.ok++;
          } else {
            registro.estado = 'SIN_TAMANO';
            registro.detalle = 'Steam no publica Storage en pc_requirements';
            resumen.sinTamano++;
          }
        }
      }

      procesadas++;
      if (procesadas % GUARDAR_CADA === 0) {
        guardar();
        console.log(`[${procesadas}/${pendientes.length}] appid=${resumen.appid} ok=${resumen.ok} sinTamano=${resumen.sinTamano} sinSteam=${resumen.sinSteam}`);
      }
    }
    guardar();
  })();

  promesa.then(() => {
    console.log('\n=== RESUMEN FASE B (STEAM) ===');
    console.log(JSON.stringify({
      filasCsv: filas.length,
      yaHechas: hechos.size - pendientes.length,
      nuevas: pendientes.length,
      con_appid: resumen.appid,
      con_size: resumen.ok,
      sin_tamano: resumen.sinTamano,
      sin_steam: resumen.sinSteam,
      sin_detalle: resumen.sinDetalle,
      descripcion_es: resumen.descEs,
      requisitos_es: resumen.reqEs,
      portada_steam: resumen.portada,
      salida: rutaSalida,
    }, null, 2));
  });
}

main();
