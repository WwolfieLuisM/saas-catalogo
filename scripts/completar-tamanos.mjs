import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Completa los tamanos que faltan en tasks/library-import-50.json a partir de
// fuentes reales localizadas a mano (PCGamingWiki, Steam, itch.io, Wikipedia,
// gamepressure, FAQ oficial de minecraft.net). Cada dato queda marcado como
// aproximado en su provenance (confidence < 1) para que el dueño lo revise.
//
// No toca: (a) registros que ya traen tamano en el fichero, (b) juegos cuyo
// tamano solo existe en la base (p. ej. football-manager-2016, editado a mano):
// al importar, un sizeValue null en el fichero conserva el valor existente.

const HERE = fileURLToPath(new URL('.', import.meta.url));
const BASE = `file:///${HERE.replace(/\\/g, '/')}`;
const RUTA = new URL('../tasks/library-import-50.json', BASE);

const INGESTA = '2026-10-21';

const TABLA = {
  'kingdom-wars-2-battles': {
    sizeValue: 5,
    sizeUnit: 'GB',
    source: 'pcgamingwiki',
    sourceUrl: 'https://www.pcgamingwiki.com/wiki/Kingdom_Wars_2:_Battles',
    confidence: 0.9,
    notes:
      'Tamaño mínimo 5 GB según PCGamingWiki (Kingdom Wars 2: Battles); Steam KW2 Definitive Edition también pide 5 GB. La descripción y los géneros vienen de RAWG.',
  },
  'f-e-a-r-platinum-collection': {
    sizeValue: 15.6,
    sizeUnit: 'GB',
    source: 'pcgamingwiki',
    sourceUrl: 'https://www.pcgamingwiki.com/wiki/F.E.A.R.',
    confidence: 0.85,
    notes:
      'PCGamingWiki: mínimo 17 GB, con nota explícita de que la versión GOG de F.E.A.R. Platinum ocupa 15,6 GB (la de esta ficha). Revisar.',
  },
  'super-mario-galaxy': {
    sizeValue: 4.7,
    sizeUnit: 'GB',
    source: 'wikipedia',
    sourceUrl: 'https://en.wikipedia.org/wiki/Wii_optical_disc',
    confidence: 0.7,
    notes:
      'Disco Wii de una sola capa de 4,7 GB: Wikipedia dice que todos los juegos eran single-layer antes de Brawl (2008) y este es de 2007. Tamaño por disco; revisar.',
  },
  'ace-combat-assault-horizon-enhanced-edition': {
    sizeValue: 16,
    sizeUnit: 'GB',
    source: 'pcgamingwiki',
    sourceUrl:
      'https://www.pcgamingwiki.com/wiki/Ace_Combat:_Assault_Horizon_-_Enhanced_Edition',
    confidence: 0.9,
    notes:
      'Requisito mínimo 16 GB (recomendado 20 GB) en PCGamingWiki; vgtimes coincide con 16 GB. Revisar.',
  },
  chiquitos: {
    sizeValue: 24,
    sizeUnit: 'MB',
    source: 'itch.io',
    sourceUrl: 'https://franvadillo.itch.io/juegos-chiquitos',
    confidence: 0.9,
    notes:
      'Tamaño real del instalador oficial JuegosChiquitosWindows.zip (24 MB) publicado en itch.io. La descripción y los géneros vienen de RAWG.',
  },
  'fallout-london': {
    sizeValue: 65,
    sizeUnit: 'GB',
    source: 'gamepressure',
    sourceUrl: 'https://www.gamepressure.com/fallout-london/system-requirements/z011527',
    confidence: 0.7,
    notes:
      'Requisito publicado: Storage 65 GB incluyendo Fallout 4 base game; el mod solo ocupa unos 30-34 GB (prensa y foro GOG). Revisar si prefieres el tamaño del mod.',
  },
  'minecraft-juego-base': {
    sizeValue: 4,
    sizeUnit: 'GB',
    source: 'minecraft.net',
    sourceUrl: 'https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc',
    confidence: 0.7,
    notes:
      'FAQ oficial: Java 2 GB mínimo / 4 GB recomendado; Bedrock 4 GB / 8 GB. Se toma 4 GB (Java recomendado). Revisar.',
  },
  'dino-crisis-bundle': {
    sizeValue: 6,
    sizeUnit: 'GB',
    source: 'steam',
    sourceUrl: 'https://store.steampowered.com/app/4249130/',
    confidence: 0.95,
    notes:
      'Suma de los requisitos oficiales de Steam: Dino Crisis 4 GB + Dino Crisis 2 GB. Datos oficiales de la store.',
  },
  'terminator-salvation': {
    sizeValue: 8,
    sizeUnit: 'GB',
    source: 'pcgamingwiki',
    sourceUrl: 'https://www.pcgamingwiki.com/wiki/Terminator:_Salvation',
    confidence: 0.9,
    notes:
      'Requisito mínimo 8 GB según PCGamingWiki (Terminator: Salvation). La descripción y los géneros vienen de RAWG.',
  },
};

const crudo = fs.readFileSync(RUTA, 'utf8');
const json = JSON.parse(crudo);

let actualizados = 0;
const omitidos = [];

for (const juego of json.games ?? []) {
  const dato = TABLA[juego.slug];
  if (!dato) continue;
  if (juego.sizeValue !== null && juego.sizeValue !== undefined) {
    omitidos.push(`${juego.slug} (ya tiene ${juego.sizeValue} ${juego.sizeUnit})`);
    continue;
  }

  juego.sizeValue = dato.sizeValue;
  juego.sizeUnit = dato.sizeUnit;

  for (const variante of juego.platformVariants ?? []) {
    if (variante.sizeValue === null || variante.sizeValue === undefined) {
      variante.sizeValue = dato.sizeValue;
      variante.sizeUnit = dato.sizeUnit;
    }
    variante.provenance = {
      source: dato.source,
      sourceUrl: dato.sourceUrl,
      confidence: dato.confidence,
      ingestedAt: INGESTA,
      notes: dato.notes,
    };
  }
  actualizados += 1;
}

const salida = JSON.stringify(json, null, 2) + (crudo.endsWith('\n') ? '\n' : '');
fs.writeFileSync(RUTA, salida, 'utf8');

const faltantes = (json.games ?? [])
  .filter((j) => j.sizeValue === null || j.sizeValue === undefined)
  .map((j) => j.slug);

console.log(`actualizados: ${actualizados}`);
for (const o of omitidos) console.log(`omitido: ${o}`);
console.log(`siguen sin tamaño: ${faltantes.join(', ') || 'ninguno'}`);
