import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { buildMeta } from '../../utils/pagination.js';
import { requestMeta } from '../../utils/requestMeta.js';
import type { TaxonomyConfig } from './taxonomy.config.js';
import {
  createTaxonomySchema,
  taxonomyIdParamSchema,
  taxonomyListQuerySchema,
  updateTaxonomySchema,
} from './taxonomy.schemas.js';
import { createTaxonomyService, taxonomyDto } from './taxonomy.service.js';

export function createTaxonomyRouter(config: TaxonomyConfig): Router {
  const router = Router();
  const service = createTaxonomyService(config);

  router.use(authenticate);

  router.get('/', async (req, res) => {
    const query = taxonomyListQuerySchema.parse(req.query);
    const { items, total } = await service.list(query, req.auth ?? null);

    res.json({
      success: true,
      data: items.map(taxonomyDto),
      meta: buildMeta(total, query.page, query.limit),
    });
  });

  router.post('/', async (req, res) => {
    const body = createTaxonomySchema.parse(req.body);
    const row = await service.create(body, req.auth ?? null, requestMeta(req));

    res.status(201).json({ success: true, data: taxonomyDto(row) });
  });

  router.get('/:id', async (req, res) => {
    const { id } = taxonomyIdParamSchema.parse(req.params);
    const row = await service.get(id, req.auth ?? null);

    res.json({ success: true, data: taxonomyDto(row) });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = taxonomyIdParamSchema.parse(req.params);
    const body = updateTaxonomySchema.parse(req.body);
    const row = await service.update(id, body, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data: taxonomyDto(row) });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = taxonomyIdParamSchema.parse(req.params);
    const row = await service.remove(id, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data: taxonomyDto(row) });
  });

  router.post('/:id/restore', async (req, res) => {
    const { id } = taxonomyIdParamSchema.parse(req.params);
    const row = await service.restore(id, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data: taxonomyDto(row) });
  });

  return router;
}
