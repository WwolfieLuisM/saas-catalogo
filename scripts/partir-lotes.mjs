// Parte un library-import@2 en N lotes casi iguales conservando el orden de
// entrada, excluyendo los slugs de un JSON de referencia (piloto ya importado)
// para no repetir registros. El patron de salida lleva un # que se sustituye
// por el numero de lote (empezando en 2, el 1 es el fichero completo).
// Uso: node scripts/partir-lotes.mjs entrada.json "salida-lote#.json" N [excluir.json]
import { readFileSync, writeFileSync } from 'node:fs';

const [entrada, patron, nTexto, excluir] = process.argv.slice(2);
if (!entrada || !patron || !patron.includes('#')) {
  console.error('Uso: node scripts/partir-lotes.mjs entrada.json "salida-lote#.json" N [excluir.json]');
  process.exit(1);
}
const n = Number(nTexto || 4);
if (!Number.isFinite(n) || n < 1) {
  console.error('N debe ser un numero de lotes >= 1');
  process.exit(1);
}

const envelope = JSON.parse(readFileSync(entrada, 'utf8'));
if (!String(envelope.schema || '').startsWith('library-import@')) {
  console.error(`schema no reconocido: ${envelope.schema}`);
  process.exit(1);
}
let juegos = envelope.games ?? [];
const totalInicial = juegos.length;

if (excluir) {
  const fuera = new Set((JSON.parse(readFileSync(excluir, 'utf8')).games ?? []).map((g) => g.slug));
  juegos = juegos.filter((g) => !fuera.has(g.slug));
  console.log(`excluidos ${totalInicial - juegos.length} slugs ya importados (${excluir})`);
}
if (!juegos.length) {
  console.error('no queda nada que repartir');
  process.exit(1);
}

const base = Math.floor(juegos.length / n);
const resto = juegos.length % n;
let posicion = 0;
const resumen = [];
for (let i = 0; i < n; i += 1) {
  const tam = base + (i < resto ? 1 : 0);
  if (tam === 0) continue;
  const trozo = juegos.slice(posicion, posicion + tam);
  posicion += tam;
  const destino = patron.replace('#', String(i + 2));
  const lote = {
    schema: envelope.schema,
    generatedAt: new Date().toISOString(),
    source: envelope.source,
    games: trozo,
  };
  writeFileSync(destino, JSON.stringify(lote, null, 2), 'utf8');
  resumen.push({
    lote: destino,
    juegos: trozo.length,
    conTamano: trozo.filter((g) => g.sizeValue != null && g.sizeValue > 0).length,
    conPortada: trozo.filter((g) => g.coverUrl).length,
  });
}
console.log(JSON.stringify({ repartidos: juegos.length, lotes: resumen }, null, 2));
