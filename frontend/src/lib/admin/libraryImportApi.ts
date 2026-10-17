import { adminFetch } from './adminApi.ts';
import type { Envelope, ImportApplied, ImportPreview } from './libraryImportView.ts';

export interface LibraryImportRequest {
  envelope: Envelope;
  fingerprint: string;
  stateFingerprint: string;
}

export function validateLibraryImport(envelope: Envelope): Promise<ImportPreview> {
  return adminFetch<ImportPreview>('/admin/library-import/validate', {
    method: 'POST',
    body: envelope,
  });
}

export const IMPORT_TIMEOUT_MS = 300_000;

export function runLibraryImport(request: LibraryImportRequest): Promise<ImportApplied> {
  return adminFetch<ImportApplied>('/admin/library-import/import', {
    method: 'POST',
    body: request,
    timeoutMs: IMPORT_TIMEOUT_MS,
  });
}