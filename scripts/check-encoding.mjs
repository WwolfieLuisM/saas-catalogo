import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Gate de encoding: detecta mojibake (UTF-8 reescrito por PowerShell en ANSI, etc.).
// Enfoque por SEÑALES:
//   - Duras (exit 1): cirílico, griego, U+FFFD y las parejas mojibake, es decir un
//     carácter de rango Ã/Ä/Å/â (U+00C0-00F4, la cabecera UTF-8 leída como CP1252)
//     inmediatamente seguido de un byte de continuación leído como CP1252 (U+0080-00BF)
//     o de Latin Extended producido por CP1252 desde 8A-9F (U+0160, U+0178...). El
//     resto de Latin Extended tras cabecera (U+017C, U+0107...) es eslavo legitimo
//     (nombres propios como Rozalski) y NO bloquea.
//   - Aviso sin fallo (exit 0): Latin Extended SOLO, sin esa pareja. Son nombres
//     legítimos muy comunes en créditos de juegos (Göktuğ, Łukasz, Jiří...).
//     Antes esto bloqueaba con falsos positivos en catálogos grandes.
// Limitación conocida: parejas mojibake cuya continuación cae en símbolos CP1252
// (â€™, â‚¬...) no se detectan; para este repo el patrón de PowerShell ANSI sí cubre.

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

const RANGOS_DUROS = [
  [0x0370, 0x03ff, 'Griego (mojibake de UTF-8 leído como latin)'],
  [0x0400, 0x04ff, 'Cirílico (mojibake de UTF-8 leído como latin)'],
  [0xfffd, 0xfffd, 'carácter de reemplazo U+FFFD'],
];

// Cabeceras UTF-8 al decodearse como CP1252 caen en Â-ô (Ã, Ä, ä...).
const esCabecera = (c) => c >= 0x00c0 && c <= 0x00f4;
// Bytes de continuación UTF-8 = 0x80-0xBF (parejas del tipo U+00C3+U+00A9,
// U+00C3+U+00B6, U+00C4+U+0178). NO subir a 0xFF: en español legítimo sí hay
// parejas altas seguidas (enseñándoles, ÁÉÍÓÚÜÑ).
const esContinuacion = (c) => c >= 0x0080 && c <= 0x00bf;
const esLatinExtended = (c) => c >= 0x0100 && c <= 0x024f;
// NBSP y guillemets son vecinos legitimos de una letra acentuada («menú», «año»,
// «...Ñ»): solo cuentan como continuacion si los precede Â o Ã, que es justo como
// se ven NBSP/«/» cuando el UTF-8 se leyo como ANSI (C2 A0 / C2 AB / C2 BB).
const esAmbiguo = (c) => c === 0x00a0 || c === 0x00ab || c === 0x00bb;
const esPareja = (anterior, actual) =>
  esContinuacion(actual) && (!esAmbiguo(actual) || anterior === 0x00c2 || anterior === 0x00c3);
// Latin Extended al que CP1252 convierte los bytes de continuacion 8A/8C/8E/9A/
// 9C/9E/9F (U+0160, U+0152, U+017D, U+0161, U+0153, U+017E, U+0178): esos si son
// mojibake tras cabecera. El resto (U+017C, U+0107, U+0159...) tras cabecera es
// ortografia eslava legitima y se queda en silencio.
const LE_CP1252 = new Set([0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e]);

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
  const relativa = relative(RAIZ, ruta);
  const duros = [];
  const avisos = [];
  const vistos = new Set();

  texto.split(/\r?\n/).forEach((linea, indice) => {
    const puntos = Array.from(linea);
    const codigo = (i) => (puntos[i] ? puntos[i].codePointAt(0) : undefined);

    for (let i = 0; i < puntos.length; i += 1) {
      const actual = codigo(i);
      if (actual === undefined) continue;
      const anterior = i > 0 ? codigo(i - 1) : undefined;

      const registrar = (tipo, motivo) => {
        const clave = `${tipo}:${actual}`;
        if (vistos.has(clave)) return;
        vistos.add(clave);
        const hallazgo = {
          fichero: relativa,
          linea: indice + 1,
          codigo: `U+${actual.toString(16).toUpperCase().padStart(4, '0')}`,
          motivo,
          texto: linea.trim().slice(0, 90),
        };
        (tipo === 'duro' ? duros : avisos).push(hallazgo);
      };

      // 1) Rangos siempre duros (cirílico, griego, U+FFFD).
      for (const [desde, hasta, motivo] of RANGOS_DUROS) {
        if (actual >= desde && actual <= hasta) registrar('duro', motivo);
      }

      // 2) Pareja mojibake: cabecera UTF-8 + continuación leídas como CP1252.
      if (anterior !== undefined && esCabecera(anterior) && esPareja(anterior, actual)) {
        registrar('duro', `pareja mojibake (U+${anterior.toString(16).toUpperCase()} + continuación): texto UTF-8 leído como ANSI`);
      }
      if (anterior !== undefined && esCabecera(anterior) && esLatinExtended(actual) && LE_CP1252.has(actual)) {
        registrar('duro', `pareja mojibake (U+${anterior.toString(16).toUpperCase()} + Latin Extended CP1252): texto UTF-8 leído como ANSI`);
      }

      // 3) Latin Extended sin pareja: probable nombre legítimo -> solo aviso.
      if (esLatinExtended(actual) && !(anterior !== undefined && esCabecera(anterior))) {
        registrar('aviso', 'Latin Extended sin indicios de mojibake (probable nombre propio legítimo)');
      }
    }
  });

  return [...duros, ...avisos];
}

const hallazgos = recorrer(RAIZ);
const errores = hallazgos.filter((h) => !h.motivo.startsWith('Latin Extended sin indicios'));
const avisos = hallazgos.filter((h) => h.motivo.startsWith('Latin Extended sin indicios'));

if (errores.length === 0 && avisos.length === 0) {
  console.log('OK: ningun fichero con mojibake (parejas ANSI, griego, cirilico, U+FFFD).');
  process.exit(0);
}

if (errores.length > 0) {
  console.log(`ERROR: ${errores.length} indicio(s) de texto corrompido:\n`);
  for (const h of errores) {
    console.log(`  ${h.fichero}:${h.linea}  ${h.codigo}  ${h.motivo}`);
    console.log(`    ${h.texto}`);
  }
  console.log(
    '\nCausa habitual: reescribir un fichero UTF-8 con PowerShell (Get-Content -Raw lee con el',
  );
  console.log('ANSI del sistema y WriteAllText guarda el mojibake como UTF-8).');
  console.log('Usa las herramientas edit/write, que preservan UTF-8.');
  process.exit(1);
}

if (avisos.length > 0) {
  console.log(`OK con ${avisos.length} aviso(s): Latin Extended sin parejas de mojibake (nombres propios probables):`);
  for (const h of avisos) console.log(`  ${h.fichero}:${h.linea}  ${h.codigo}  ${h.texto.slice(0, 70)}`);
  process.exit(0);
}
