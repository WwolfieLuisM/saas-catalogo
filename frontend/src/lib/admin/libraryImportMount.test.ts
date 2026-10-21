import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regresion: LibraryImportSection.tsx y libraryImportApi.ts existian y estaban
// terminados, pero no los montaba ninguna pantalla. El importador
// library-import@2 era inalcanzable desde el panel, y quien buscaba "importar"
// acababa en el importador de catalogo de tenant
// (Configuracion > Datos > "Importar catalogo"), que habla otro formato y
// exige tenantId, con lo que devolvia "tenantId es obligatorio para SUPER_ADMIN"
// sobre un archivo que era perfectamente valido.
const PAGINA_DATOS = fileURLToPath(
  new URL('../../app/admin/(panel)/configuracion/datos/page.tsx', import.meta.url),
);

test('Configuracion > Datos importa LibraryImportSection', () => {
  const fuente = readFileSync(PAGINA_DATOS, 'utf8');
  assert.match(
    fuente,
    /import\s*\{[^}]*\bLibraryImportSection\b[^}]*\}\s*from/,
    'la pagina de Datos no importa LibraryImportSection',
  );
});

test('Configuracion > Datos renderiza LibraryImportSection', () => {
  const fuente = readFileSync(PAGINA_DATOS, 'utf8');
  assert.match(
    fuente,
    /<LibraryImportSection\s*\/>/,
    'LibraryImportSection no se renderiza en la pagina de Datos',
  );
});
