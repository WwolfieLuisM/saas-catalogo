import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requestMeta } from '../../utils/requestMeta.js';
import type {
  ImportBackupInput,
  ExportQuery,
  ValidateImportInput,
  RunImportInput,
} from './data-transfer.schemas.js';
import {
  exportQuerySchema,
  importBackupSchema,
  runImportSchema,
  validateImportSchema,
} from './data-transfer.schemas.js';
import {
  createImportBackup,
  exportCatalog,
  exportMediaManifest,
  previewImport,
  runImport,
  validateImport,
} from './data-transfer.service.js';

export function createExportRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get('/catalog', async (req, res) => {
    const query: ExportQuery = exportQuerySchema.parse(req.query);
    const { payload, filename } = await exportCatalog(query, req.auth ?? null, requestMeta(req));

    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(payload);
  });

  router.get('/media-manifest', async (req, res) => {
    const query: ExportQuery = exportQuerySchema.parse(req.query);
    const { payload, filename } = await exportMediaManifest(
      query,
      req.auth ?? null,
      requestMeta(req),
    );

    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(payload);
  });

  return router;
}

export function createImportRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.post('/validate', async (req, res) => {
    const body: ValidateImportInput = validateImportSchema.parse(req.body);
    const data = await validateImport(body, req.auth ?? null);

    res.json({ success: true, data });
  });

  router.post('/preview', async (req, res) => {
    const body: ValidateImportInput = validateImportSchema.parse(req.body);
    const data = await previewImport(body, req.auth ?? null);

    res.json({ success: true, data });
  });

  router.post('/backup', async (req, res) => {
    const body: ImportBackupInput = importBackupSchema.parse(req.body);
    const data = await createImportBackup(body, req.auth ?? null, requestMeta(req));

    res.status(201).json({ success: true, data });
  });

  router.post('/run', async (req, res) => {
    const body: RunImportInput = runImportSchema.parse(req.body);
    const data = await runImport(body, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  return router;
}
