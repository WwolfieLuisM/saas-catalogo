import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import {
  LIBRARY_IMPORT_SCHEMA,
  libraryImportEnvelopeSchema,
  libraryImportRequestSchema,
  type LibraryImportEnvelope,
  type LibraryImportRequest,
} from './library-import.schemas.js';
import { importLibraryImport, validateLibraryImport } from './library-import.service.js';
import { requestMeta } from '../../utils/requestMeta.js';

export function createLibraryImportRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRoles('SUPER_ADMIN'));

  router.post('/validate', async (req, res) => {
    const rawBody = req.body as Record<string, unknown> | null | undefined;
    if (rawBody !== null && typeof rawBody === 'object' && 'schema' in rawBody) {
      const rawSchema = rawBody.schema;
      if (typeof rawSchema !== 'string' || rawSchema.trim() !== LIBRARY_IMPORT_SCHEMA) {
        throw new AppError(
          400,
          'LIBRARY_IMPORT_SCHEMA_UNSUPPORTED',
          `El archivo declara "${describeSchemaValue(rawSchema)}" y el importador solo admite "${LIBRARY_IMPORT_SCHEMA}": regenera el JSON con el prompt v2.`,
        );
      }
    }

    const envelope: LibraryImportEnvelope = libraryImportEnvelopeSchema.parse(req.body);
    const data = await validateLibraryImport(envelope);

    res.json({ success: true, data });
  });

  router.post('/import', async (req, res) => {
    const rawEnvelope = (req.body as { envelope?: unknown } | null | undefined)?.envelope;
    if (rawEnvelope !== null && typeof rawEnvelope === 'object' && 'schema' in rawEnvelope) {
      const rawSchema = (rawEnvelope as { schema?: unknown }).schema;
      if (typeof rawSchema !== 'string' || rawSchema.trim() !== LIBRARY_IMPORT_SCHEMA) {
        throw new AppError(
          400,
          'LIBRARY_IMPORT_SCHEMA_UNSUPPORTED',
          `El archivo declara "${describeSchemaValue(rawSchema)}" y el importador solo admite "${LIBRARY_IMPORT_SCHEMA}": regenera el JSON con el prompt v2.`,
        );
      }
    }

    const body: LibraryImportRequest = libraryImportRequestSchema.parse(req.body);
    const data = await importLibraryImport(
      body.envelope,
      body.fingerprint,
      body.stateFingerprint,
      req.auth ?? null,
      requestMeta(req),
    );

    res.json({ success: true, data });
  });

  return router;
}

function describeSchemaValue(value: unknown): string {
  if (typeof value === 'string') return value.trim().slice(0, 50);
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(describeSchemaValue).join(', ')}]`;
  return typeof value;
}