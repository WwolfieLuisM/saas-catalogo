// Fase G1: convierte el intermedio del motor de backfill en un JSON
// `library-import@2` que SOLO cambia tamaños (y provenance dentro de
// platformVariants), mas la tabla de notas de provenance para revision.
//
// - `sizeValue`/`sizeUnit` del registro y de TODAS las variantes = size_gb en GB.
// - provenance por variante: {source, sourceUrl?, confidence?, ingestedAt, notes}.
// - Diferencia interna contra lote1 ignorando SOLO sizeValue/sizeUnit/
//   platformVariants (y dentro de variantes sizeValue/sizeUnit/provenance);
//   cualquier otra variacion imprime el campo y sale con exit 1.
// - `tasks/backfill-tamanos-manual.json` (Task 3, opcional) gana a la automatica.
//
// Uso: node scripts/construir-backfill-import.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RUTA_INTERMEDIO = 'backend/scripts/backfill-tamanos.json';
const RUTA_LOTE1 = 'tasks/library-import-lote1.json';
const RUTA_MANUAL = 'tasks/backfill-tamanos-manual.json';
const SALIDA_JSON = 'tasks/library-import-backfill.json';
const SALIDA_MD = 'tasks/backfill-tamanos-notas.md';
const FUENTE = 'Fase G1 backfill de tamaños';

export function transformar(juego, registro, hoy) {
  const salida = structuredClone(juego);
  salida.sizeValue = registro.size_gb;
  salida.sizeUnit = 'GB';
  const provenance = {
    source: registro.fuente,
    ingestedAt: hoy,
    notes: registro.notas ?? '',
  };
  if (registro.url) provenance.sourceUrl = registro.url;
  if (registro.confidence != null) provenance.confidence = registro.confidence;
  salida.platformVariants = salida.platformVariants.map((v) => ({
    ...v,
    sizeValue: registro.size_gb,
    sizeUnit: 'GB',
    provenance,
  }));
  return salida;
}

export function diffSoloTamanos(original, salida) {
  const diferencias = [];
  const omitirCima = new Set(['sizeValue', 'sizeUnit', 'platformVariants']);
  const claves = new Set([...Object.keys(original ?? {}), ...Object.keys(salida ?? {})]);
  for (const clave of claves) {
    if (omitirCima.has(clave)) continue;
    if (JSON.stringify(original[clave] ?? null) !== JSON.stringify(salida[clave] ?? null)) diferencias.push(clave);
  }
  const vo = original?.platformVariants ?? [];
  const vs = salida?.platformVariants ?? [];
  if (vo.length !== vs.length) {
    diferencias.push('platformVariants');
    return diferencias;
  }
  const omitirVariante = new Set(['sizeValue', 'sizeUnit', 'provenance']);
  vs.forEach((variante, i) => {
    const antes = vo[i] ?? {};
    const ahora = variante ?? {};
    const subclaves = new Set([...Object.keys(antes), ...Object.keys(ahora)]);
    for (const clave of subclaves) {
      if (omitirVariante.has(clave)) continue;
      if (JSON.stringify(antes[clave] ?? null) !== JSON.stringify(ahora[clave] ?? null)) diferencias.push(`platformVariants[${i}].${clave}`);
    }
  });
  return diferencias;
}

export function construir({ lote1, intermedio, manual, hoy }) {
  const automaticos = new Map((intermedio?.registros ?? []).map((r) => [r.slug, r]));
  const manuales = new Map((Array.isArray(manual) ? manual : manual?.registros ?? []).map((r) => [r.slug, r]));
  const usados = new Map(automaticos);
  for (const [slug, r] of manuales) usados.set(slug, r); // la entrada manual gana

  const originales = new Map((lote1.games ?? []).map((g) => [g.slug, g]));
  const games = [];
  const diferencias = [];
  let automatizados = 0;
  let manualesContados = 0;
  for (const [slug, registro] of usados) {
    if (registro.size_gb == null) continue; // residual sin constancia: fuera
    const original = originales.get(slug);
    if (!original) {
      diferencias.push(`slug sin contraparte en lote1: ${slug}`);
      continue;
    }
    const salida = transformar(original, registro, hoy);
    diferencias.push(...diffSoloTamanos(original, salida));
    games.push(salida);
    if (manuales.has(slug)) manualesContados += 1;
    else automatizados += 1;
  }

  const envelope = {
    schema: 'library-import@2',
    generatedAt: new Date().toISOString(),
    source: FUENTE,
    games,
  };
  const notasMd = tablaNotas([...usados.values()].filter((r) => r.size_gb != null));
  const resumen = { automatizados, manuales: manualesContados, recuperados: games.length, diferencias };
  return { envelope, notasMd, resumen };
}

export function tablaNotas(registros) {
  const filas = [...registros].sort((a, b) => (b.modo === 'juego-base' ? 1 : 0) - (a.modo === 'juego-base' ? 1 : 0));
  const lineas = [
    '# Backfill de tamaños — matches para revisión',
    '',
    'Los `juego-base` salen primero: el tamaño publicado es del juego base y así lo indica la provenance en `notes`.',
    '',
    '| slug | título | modo | fuente | confianza | URL |',
    '| --- | --- | --- | --- | --- | --- |',
    ...filas.map((r) => `| ${r.slug} | ${r.titulo} | ${r.modo} | ${r.fuente} | ${r.confidence} | ${r.url} |`),
    '',
  ];
  return lineas.join('\n');
}

function main() {
  const lote1 = JSON.parse(readFileSync(RUTA_LOTE1, 'utf8'));
  const intermedio = JSON.parse(readFileSync(RUTA_INTERMEDIO, 'utf8'));
  let manual = null;
  if (existsSync(RUTA_MANUAL)) {
    const bruto = JSON.parse(readFileSync(RUTA_MANUAL, 'utf8'));
    manual = Array.isArray(bruto) ? { registros: bruto } : bruto;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const { envelope, notasMd, resumen } = construir({ lote1, intermedio, manual, hoy });

  console.log(`diferencias fuera de tamaños: ${resumen.diferencias.length}`);
  console.log(`recuperados: ${resumen.recuperados} = automatizados ${resumen.automatizados} + manuales ${resumen.manuales}`);
  if (resumen.diferencias.length) {
    for (const d of resumen.diferencias.slice(0, 20)) console.log('  ' + d);
    process.exit(1);
  }
  writeFileSync(SALIDA_JSON, JSON.stringify(envelope, null, 2), 'utf8');
  writeFileSync(SALIDA_MD, notasMd, 'utf8');
  console.log(`escrito ${SALIDA_JSON} (${envelope.games.length} juegos) y ${SALIDA_MD}`);
}

const esCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esCli) main();
