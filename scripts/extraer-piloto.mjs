// Extrae un piloto reproducible de un JSON library-import@2 generado por
// construir-import.mjs. Mismo envelope; solo se subconjunta `games` con un
// barajado mulberry32 de semilla fija (resultado identico en cualquier maquina).
// Uso: node scripts/extraer-piloto.mjs entrada.json salida.json [n=50] [semilla]
import { readFileSync, writeFileSync } from 'node:fs';

const [entrada, salida, nTexto, semillaTexto] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('Uso: node scripts/extraer-piloto.mjs entrada.json salida.json [n] [semilla]');
  process.exit(1);
}
const n = Number(nTexto || 50);
const semilla = Number(semillaTexto || 20261022);
if (!Number.isFinite(n) || n < 1 || !Number.isFinite(semilla)) {
  console.error('n y semilla deben ser numeros');
  process.exit(1);
}

const envelope = JSON.parse(readFileSync(entrada, 'utf8'));
if (!String(envelope.schema || '').startsWith('library-import@')) {
  console.error(`schema no reconocido: ${envelope.schema}`);
  process.exit(1);
}
const juegos = envelope.games ?? [];
if (juegos.length < n) {
  console.error(`el fichero tiene ${juegos.length} juegos y se piden ${n}`);
  process.exit(1);
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(semilla);
const indices = juegos.map((_, i) => i);
for (let i = indices.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rand() * (i + 1));
  [indices[i], indices[j]] = [indices[j], indices[i]];
}
// En orden de entrada para que el piloto sea estable frente al lote completo.
const elegidos = indices
  .slice(0, n)
  .sort((a, b) => a - b)
  .map((i) => juegos[i]);

const piloto = {
  schema: envelope.schema,
  generatedAt: new Date().toISOString(),
  source: envelope.source,
  games: elegidos,
};
writeFileSync(salida, JSON.stringify(piloto, null, 2), 'utf8');

const conTamano = elegidos.filter((g) => g.sizeValue != null && g.sizeValue > 0).length;
const conPortada = elegidos.filter((g) => g.coverUrl).length;
const conDesc = elegidos.filter((g) => g.description).length;
console.log(
  JSON.stringify(
    {
      entrada: juegos.length,
      piloto: elegidos.length,
      semilla,
      conTamano,
      conPortada,
      conDesc,
      destino: salida,
    },
    null,
    2,
  ),
);
