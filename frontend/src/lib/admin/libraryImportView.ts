import { ApiError } from '../api/client.ts';

export type ImportAction = 'create' | 'update' | 'skip' | 'error';
export type ImportStatus = 'ACTIVE' | 'INCOMPLETE';

export interface ImportRecordError {
  code: string;
  field: string;
  message: string;
}

export interface ImportPreviewRecord {
  index: number;
  slug: string | null;
  action: ImportAction;
  status: ImportStatus | null;
  errors: ImportRecordError[];
  changes: string[];
}

export interface ImportSummary {
  total: number;
  create: number;
  update: number;
  skip: number;
  error: number;
}

export interface ImportTaxonomy {
  missingGenres: string[];
  missingCategories: string[];
  missingPlatforms: string[];
}

export interface ImportPreview {
  fingerprint: string;
  stateFingerprint: string;
  schema: string;
  summary: ImportSummary;
  records: ImportPreviewRecord[];
  taxonomy: ImportTaxonomy;
}

export interface ImportAppliedRecord {
  index: number;
  slug: string | null;
  action: ImportAction;
  status: ImportStatus | null;
  errors: ImportRecordError[];
  auditId: string | null;
}

export interface ImportApplied {
  fingerprint: string;
  summary: Omit<ImportSummary, 'total'>;
  records: ImportAppliedRecord[];
  warnings: string[];
}

export type Envelope = unknown;

export function actionLabel(action: ImportAction): string {
  if (action === 'create') return 'Nuevo';
  if (action === 'update') return 'Actualizar';
  if (action === 'skip') return 'Sin cambios';
  return 'Error';
}

export function actionTone(action: ImportAction): string {
  if (action === 'create') return 'ok';
  if (action === 'update') return 'au';
  if (action === 'skip') return 'in';
  return 'bd';
}

export function canImport(preview: ImportPreview): boolean {
  return preview.summary.create + preview.summary.update > 0;
}

export function visibleRecords(
  records: ImportPreviewRecord[],
  limit: number,
): { shown: ImportPreviewRecord[]; hidden: number } {
  return { shown: records.slice(0, limit), hidden: Math.max(0, records.length - limit) };
}

export function taxonomySlugs(preview: ImportPreview): string[] {
  return [
    ...preview.taxonomy.missingGenres,
    ...preview.taxonomy.missingCategories,
    ...preview.taxonomy.missingPlatforms,
  ];
}

export function parseEnvelope(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es JSON válido. Revísalo y vuelve a intentarlo.');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El archivo debe ser un objeto JSON con la lista de juegos.');
  }

  const games = (parsed as { games?: unknown }).games;
  if (!Array.isArray(games)) {
    throw new Error('El archivo no tiene la lista "games". Debe ser un archivo library-import@2.');
  }

  return parsed;
}

export function isUnknownOutcome(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.name === 'TimeoutError';
}

export function describeImportFailure(error: unknown): string {
  if (isUnknownOutcome(error)) {
    return 'La importación se cortó sin respuesta: no se sabe si llegó a aplicarse. Vuelve a validar el archivo para ver el estado real antes de reintentar.';
  }
  if (error instanceof ApiError) {
    if (error.code === 'IMPORT_PREVIEW_STALE') {
      return 'La biblioteca cambió mientras revisabas el archivo: vuelve a validarlo para ver el estado actual.';
    }
    if (error.code === 'FINGERPRINT_MISMATCH') {
      return 'El archivo cambió desde la validación: vuelve a validarlo antes de importar.';
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo completar la operación. Revisa el archivo e inténtalo de nuevo.';
}