import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const IGNORAR = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'coverage',
  '.open-next',
  'out',
]);

const RANGOS_SOSPECHOSOS = [
  [0x0100, 0x024f, 'Latin Extended (típico de mojibake GBK/CP1252)'],
  [0x0370, 0x03ff, 'Griego (típico de mojibake UTF-8 leído como latin)'],
  [0x0400, 0x04ff, 'Cirílico (típico de mojibake UTF-8 leído como latin)'],
  [0xfffd, 0xfffd, 'caracteres de reemplazo U+FFFD'],
];

const EXTENSIONES = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.md', '.json']);

function recorrer(dir) {
  const hallazgos = [];
  for (const entrada of readdirSync(dir)) {
    if (IGNORAR.has(entrada)) continue;
    const ruta = join(dir, entrada);
    const stats = statSync(ruta);
    if (stats.isDirectory()) {
      hallazgos.push(...recorrer(ruta));
      continue;
    }
    const punto = ruta.lastIndexOf('.');
    if (punto === -1 || !EXTENSIONES.has(ruta.slice(punto))) continue;
    hallazgos.push(...revisar(ruta));
  }
  return hallazgos;
}

function revisar(ruta) {
  const texto = readFileSync(ruta, 'utf8');
  const Relative = relative(RAIZ, ruta);
  const salida = [];
  const vistas = new Set();

  texto.split(/\r?\n/).forEach((linea, indice) => {
    for (const [desde, hasta, motivo] of RANGOS_SOSPECHOSOS) {
      for (let i = 0; i < linea.length; i += 1) {
        const codigo = linea.codePointAt(i);
        if (codigo === undefined) continue;
        if (codigo >= desde && codigo <= hasta && !vistas.has(codigo)) {
          vistas.add(codigo);
          salida.push({
            fichero: Relative,
            linea: indice + 1,
            codigo: `U+${codigo.toString(16).toUpperCase().padStart(4, '0')}`,
            motivo,
            texto: linea.trim().slice(0, 90),
          });
        }
      }
    }
  });

  return salida;
}

const hallazgos = recorrer(RAIZ);

if (hallazgos.length === 0) {
  console.log('OK: ningun fichero con mojibake (U+0100-024F, griego, cirilico, U+FFFD).');
  process.exit(0);
}

console.log(`ATENCION: ${hallazgos.length} indicio(s) de texto corrompido:\n`);
for (const h of hallazgos) {
  console.log(`  ${h.fichero}:${h.linea}  ${h.codigo}  ${h.motivo}`);
  console.log(`    ${h.texto}`);
}
console.log(
  '\nCausa habitual: reescribir un fichero UTF-8 con PowerShell (Get-Content -Raw lee con el',
);
console.log('ANSI del sistema y WriteAllText guarda el mojibake como UTF-8).');
console.log('Usa las herramientas edit/write, que preservan UTF-8.');
process.exit(1);