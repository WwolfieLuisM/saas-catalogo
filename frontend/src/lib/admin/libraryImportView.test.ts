import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/client.ts';
import {
  actionLabel,
  actionTone,
  canImport,
  describeImportFailure,
  isUnknownOutcome,
  parseEnvelope,
  visibleRecords,
  type ImportPreview,
} from './libraryImportView.ts';

function preview(overrides: Partial<ImportPreview['summary']> = {}): ImportPreview {
  return {
    fingerprint: 'a'.repeat(64),
    stateFingerprint: 'b'.repeat(64),
    schema: 'library-import@2',
    summary: { total: 3, create: 2, update: 1, skip: 0, error: 0, ...overrides },
    records: [],
    taxonomy: { missingGenres: [], missingCategories: [], missingPlatforms: [] },
  };
}

test('actionLabel y actionTone traducen las cuatro acciones', () => {
  assert.equal(actionLabel('create'), 'Nuevo');
  assert.equal(actionLabel('update'), 'Actualizar');
  assert.equal(actionLabel('skip'), 'Sin cambios');
  assert.equal(actionLabel('error'), 'Error');
  assert.equal(actionTone('create'), 'ok');
  assert.equal(actionTone('update'), 'au');
  assert.equal(actionTone('skip'), 'in');
  assert.equal(actionTone('error'), 'bd');
});

test('canImport solo habilita la importación si hay algo que escribir', () => {
  assert.equal(canImport(preview()), true);
  assert.equal(canImport(preview({ create: 0, update: 0, skip: 3, error: 0 })), false);
  assert.equal(canImport(preview({ create: 0, update: 0, skip: 0, error: 3 })), false);
  assert.equal(canImport(preview({ create: 0, update: 2, skip: 1, error: 0 })), true);
});

test('visibleRecords recorta listas largas sin perder el total', () => {
  const records = Array.from({ length: 120 }, (_, index) => ({
    index,
    slug: `juego-${index}`,
    action: 'create' as const,
    status: 'ACTIVE' as const,
    changes: ['+new'],
    errors: [],
  }));

  assert.deepEqual(visibleRecords(records, 50), { shown: records.slice(0, 50), hidden: 70 });
  assert.deepEqual(visibleRecords(records.slice(0, 3), 50), {
    shown: records.slice(0, 3),
    hidden: 0,
  });
  assert.deepEqual(visibleRecords([], 50), { shown: [], hidden: 0 });
});

test('describeImportFailure explica los 409 con una acción concreta', () => {
  assert.match(
    describeImportFailure(
      new ApiError('lo que sea', 409, 'IMPORT_PREVIEW_STALE'),
    ),
    /biblioteca cambió/i,
  );
  assert.match(
    describeImportFailure(new ApiError('lo que sea', 409, 'FINGERPRINT_MISMATCH')),
    /archivo cambió/i,
  );
});

test('describeImportFailure deja ver el mensaje del servidor cuando es útil', () => {
  assert.equal(
    describeImportFailure(
      new ApiError('El archivo declara "library-import@1"', 400, 'LIBRARY_IMPORT_SCHEMA_UNSUPPORTED'),
    ),
    'El archivo declara "library-import@1"',
  );
  assert.equal(
    describeImportFailure(new Error('No se pudo leer el archivo')),
    'No se pudo leer el archivo',
  );
  assert.match(describeImportFailure(null), /No se pudo completar/i);
});

test('describeImportFailure distingue los errores por registro de los de archivo entero', () => {
  const conErrores = preview({ create: 0, update: 0, skip: 0, error: 3 });
  assert.equal(canImport(conErrores), false);
});

test('parseEnvelope rechaza lo que no es un archivo importable antes de llamar al servidor', () => {
  assert.throws(() => parseEnvelope('{ esto no es json'), /no es JSON válido/i);
  assert.throws(() => parseEnvelope('[]'), /objeto JSON/i);
  assert.throws(() => parseEnvelope('"texto"'), /objeto JSON/i);
  assert.throws(() => parseEnvelope('{"schema":"library-import@2"}'), /no tiene la lista "games"/i);
});

test('un corte de red no se confunde con "no se aplicó"', () => {
  const abort = new Error('The operation was aborted');
  abort.name = 'AbortError';
  const timeout = new Error('The operation timed out');
  timeout.name = 'TimeoutError';

  assert.equal(isUnknownOutcome(abort), true);
  assert.equal(isUnknownOutcome(timeout), true);
  assert.equal(isUnknownOutcome(new ApiError('x', 409, 'IMPORT_PREVIEW_STALE')), false);
  assert.equal(isUnknownOutcome(null), false);
  assert.match(describeImportFailure(abort), /no se sabe si llegó a aplicarse/i);
});

test('parseEnvelope acepta un envelope con games aunque le falte schema (lo rechaza el backend con su mensaje)', () => {
  const envelope = parseEnvelope('{"games":[]}');
  assert.deepEqual(envelope, { games: [] });
});