import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Repara tasks/library-import-50.json del bug del extractor de requisitos ES:
// con el rotulo "SO *" la regex antigua (sin \b) casaba /OS:/ dentro de "Graficos:"
// y el valor de la grafica se colaba en `os`. Deteccion: os === gpu.
// Reconsulta appdetails l=spanish (l=english como respaldo por campo) con el
// extractor corregido. Sin appid Steam: elimina el `os` corrupto (no se inventa).
// Idempotente: si no detecta nada, no escribe nada.
//   node scripts/corregir-requisitos-so.mjs

const RUTA = fileURLToPath(new URL('../tasks/library-import-50.json', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function traerApp(appid, lang) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=${lang}&cc=US`;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.status === 429) { await sleep(3000 * (intento + 1)); continue; }
      if (!r.ok) return null;
      const json = await r.json();
      const dato = json?.[appid];
      return dato?.success ? dato.data : null;
    } catch {
      await sleep(800 * (intento + 1));
    }
  }
  return null;
}

const roto = (r) => Boolean(r && r.os && r.gpu && r.os === r.gpu);

function appidDe(registro) {
  for (const v of registro.platformVariants ?? []) {
    const url = v.provenance?.sourceUrl;
    if (!url) continue;
    const m = String(url).match(/\/app\/(\d+)\//);
    if (m) return m[1];
  }
  return null;
}

function limpiarOs(req) {
  if (!roto(req)) return req;
  const { os, ...resto } = req;
  return resto;
}

async function main() {
  const env = JSON.parse(fs.readFileSync(RUTA, 'utf8'));
  const afectados = env.games.filter((g) => roto(g.minimumRequirements) || roto(g.recommendedRequirements));
  console.log(`Juegos con os === gpu (parseo corrupto): ${afectados.length}`);
  if (!afectados.length) return;

  const resumen = { reparados: [], sinAppid: [], fallidos: [] };

  for (const g of afectados) {
    const appid = appidDe(g);
    if (!appid) {
      // Sin appid no hay forma de reverificar: se elimina el valor probado corrupto.
      g.minimumRequirements = limpiarOs(g.minimumRequirements);
      g.recommendedRequirements = limpiarOs(g.recommendedRequirements);
      for (const v of g.platformVariants ?? []) {
        v.minimumRequirements = limpiarOs(v.minimumRequirements);
        v.recommendedRequirements = limpiarOs(v.recommendedRequirements);
      }
      resumen.sinAppid.push(g.title);
      continue;
    }

    const detEs = await traerApp(appid, 'spanish');
    await sleep(300);
    const detEn = await traerApp(appid, 'english');
    await sleep(300);

    const minEs = limpiarRequisitos(extraerRequisitos(detEs?.pc_requirements?.minimum));
    const recEs = limpiarRequisitos(extraerRequisitos(detEs?.pc_requirements?.recommended));
    const minEn = limpiarRequisitos(extraerRequisitos(detEn?.pc_requirements?.minimum));
    const recEn = limpiarRequisitos(extraerRequisitos(detEn?.pc_requirements?.recommended));

    const min = minEs ?? minEn;
    const rec = recEs ?? recEn ?? min;
    if (!min) {
      resumen.fallidos.push(`${g.title} (appid ${appid}: Steam no devolvio requisitos)`);
      continue;
    }

    g.minimumRequirements = min;
    g.recommendedRequirements = rec;
    for (const v of g.platformVariants ?? []) {
      if (v.minimumRequirements) v.minimumRequirements = min;
      if (v.recommendedRequirements) v.recommendedRequirements = rec;
    }
    resumen.reparados.push(`${g.title} (os: ${min.os ?? '(sin OS)'})`);
  }

  fs.writeFileSync(RUTA, JSON.stringify(env, null, 2) + '\n', 'utf8');

  console.log(`\nReparados (${resumen.reparados.length}):`);
  for (const x of resumen.reparados) console.log('· ' + x);
  if (resumen.sinAppid.length) {
    console.log(`\nSin appid Steam -> os corrupto eliminado (${resumen.sinAppid.length}):`);
    for (const x of resumen.sinAppid) console.log('· ' + x);
  }
  if (resumen.fallidos.length) {
    console.log(`\nFallidos (reintentar): ${resumen.fallidos.join(' | ')}`);
  }
}

main();
