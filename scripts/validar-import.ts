import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LIBRARY_IMPORT_SCHEMA,
  libraryImportEnvelopeSchema,
  libraryImportRecordSchema,
} from '../backend/src/modules/library-import/library-import.schemas.js';

// Validador generico para cualquier fichero library-import@2.
// Uso:  cd backend && npx tsx ../scripts/validar-import.ts ../tasks/mi-lote.json
// (tsx porque importa los esquemas reales desde backend/src/modules.)

// Taxonomia global tal y como esta ahora mismo en produccion (GET con SUPER_ADMIN).
const CATEGORIAS = ['accion', 'aventura', 'carreras', 'deportes', 'otros', 'puzzle', 'rol', 'sigilo', 'simulacion', 'terror'];
const GENEROS = [
  'accion', 'arcade', 'aventura', 'carreras', 'cartas-y-mesa', 'casual', 'ciencia-ficcion',
  'conduccion', 'construccion', 'deportes', 'disparos', 'estrategia', 'estrategia-en-tiempo-real',
  'fantasia', 'futbol', 'granja', 'hack-and-slash', 'indie', 'lucha', 'moba', 'mitologia',
  'mundo-abierto', 'musica', 'plataformas', 'point-and-click', 'por-turnos', 'postapocaliptico',
  'puzzle', 'relajante', 'rol', 'sandbox', 'simulacion', 'supervivencia', 'tactico', 'western',
];
const PLATAFORMAS = ['pc', 'ps4', 'ps5', 'switch', 'xbox-one', 'xbox-series-x'];

const entrada = process.argv[2];
if (!entrada) {
  console.error('Uso: npx tsx scripts/validar-import.ts <ruta-del-json>');
  process.exit(2);
}

let envelope;
try {
  const crudo = fs.readFileSync(entrada, 'utf8');
  envelope = JSON.parse(crudo);
} catch (e) {
  console.error(`No se pudo leer/parsear ${entrada}: ${e.message}`);
  process.exit(2);
}

let fallos = 0;

console.log(`--- 0. Archivo ---`);
console.log(`   ${entrada}`);

console.log('--- 1. Envelope (esquema estricto) ---');
const envParse = libraryImportEnvelopeSchema.safeParse(envelope);
if (!envParse.success) {
  fallos++;
  for (const issue of envParse.error.issues) {
    console.log(`   ${issue.path.join('.') || '(raiz)'} -> ${issue.message}`);
  }
} else {
  console.log('   OK');
}

console.log('--- 2. Version de esquema ---');
if (envelope.schema !== LIBRARY_IMPORT_SCHEMA) {
  fallos++;
  console.log(`   DECLARADO "${envelope.schema}" != REQUERIDO "${LIBRARY_IMPORT_SCHEMA}"`);
} else {
  console.log(`   OK  (${envelope.schema})`);
}

console.log('--- 3. Registros contra libraryImportRecordSchema ---');
const registros = Array.isArray(envelope.games) ? envelope.games : [];
registros.forEach((g, i) => {
  const res = libraryImportRecordSchema.safeParse(g);
  if (!res.success) {
    fallos++;
    console.log(`   #${i} ${g?.title ?? '(sin titulo)'}`);
    for (const issue of res.error.issues) {
      console.log(`      ${issue.path.join('.') || '(raiz)'} -> ${issue.message}`);
    }
  }
});
console.log(fallos ? `   con errores: ${fallos}` : `   OK  (${registros.length}/${registros.length} registros validos)`);

console.log('--- 4. Taxonomia contra la lista global real ---');
const desconocidos = new Set();
for (const g of registros) {
  if (g.categorySlug && !CATEGORIAS.includes(g.categorySlug)) desconocidos.add(`categoria:${g.categorySlug}`);
  for (const x of g.genreSlugs ?? []) if (!GENEROS.includes(x)) desconocidos.add(`genero:${x}`);
  for (const v of g.platformVariants ?? []) if (!PLATAFORMAS.includes(v.platformSlug)) desconocidos.add(`plataforma:${v.platformSlug}`);
}
if (desconocidos.size) {
  fallos++;
  for (const d of desconocidos) console.log(`   NO EXISTE EN PRODUCCION: ${d}`);
} else {
  console.log('   OK  (todos los slugs existen en la taxonomia global)');
}

console.log('--- 5. Slugs duplicados dentro del fichero ---');
const vistos = new Map();
for (const g of registros) {
  vistos.set(g.slug, (vistos.get(g.slug) ?? 0) + 1);
}
const dupes = [...vistos.entries()].filter(([, n]) => n > 1);
if (dupes.length) {
  fallos++;
  for (const [s, n] of dupes) console.log(`   "${s}" aparece ${n} veces`);
} else {
  console.log(`   OK  (${vistos.size} slugs unicos)`);
}

console.log('--- 6. Cobertura ---');
const cuenta = (f) => registros.filter(f).length;
console.log(`   descripcion     ${cuenta((g) => g.description)}/${registros.length}`);
console.log(`   portada         ${cuenta((g) => g.coverUrl)}/${registros.length}`);
console.log(`   tamano          ${cuenta((g) => g.sizeValue)}/${registros.length}`);
console.log(`   requisitos      ${cuenta((g) => g.minimumRequirements)}/${registros.length}`);
console.log(`   desarrollador   ${cuenta((g) => g.developer)}/${registros.length}`);
console.log(`   editor          ${cuenta((g) => g.publisher)}/${registros.length}`);
console.log(`   generos         ${cuenta((g) => (g.genreSlugs ?? []).length > 0)}/${registros.length}`);
console.log(`   categoria       ${cuenta((g) => g.categorySlug)}/${registros.length}`);
console.log(`   anyo            ${cuenta((g) => g.releaseYear)}/${registros.length}`);
console.log(`   variante PC     ${cuenta((g) => (g.platformVariants ?? []).length > 0)}/${registros.length}`);

console.log('');
if (fallos) {
  console.log(`RESULTADO: ${fallos} bloque(s) con errores`);
  process.exit(1);
}
console.log(`RESULTADO: VALIDO — ${registros.length} registros listos para importar`);
