import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { buildMeta } from '../../utils/pagination.js';
import { requestMeta } from '../../utils/requestMeta.js';
import {
  createTenantSchema,
  tenantIdParamSchema,
  tenantListQuerySchema,
  updateTenantSchema,
} from './tenants.schemas.js';
import * as tenantsService from './tenants.service.js';

export function createTenantsRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRoles('SUPER_ADMIN'));

  router.get('/', async (req, res) => {
    const query = tenantListQuerySchema.parse(req.query);
    const { items, total } = await tenantsService.listTenants(query);

    res.json({
      success: true,
      data: items.map(tenantsService.tenantDto),
      meta: buildMeta(total, query.page, query.limit),
    });
  });

  router.post('/', async (req, res) => {
    const body = createTenantSchema.parse(req.body);
    const tenant = await tenantsService.createTenant(body, req.auth ?? null, requestMeta(req));

    res.status(201).json({ success: true, data: tenantsService.tenantDto(tenant) });
  });

  router.get('/:id', async (req, res) => {
    const { id } = tenantIdParamSchema.parse(req.params);
    const tenant = await tenantsService.getTenant(id);

    res.json({ success: true, data: tenantsService.tenantDto(tenant) });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = tenantIdParamSchema.parse(req.params);
    const body = updateTenantSchema.parse(req.body);
    const tenant = await tenantsService.updateTenant(id, body, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data: tenantsService.tenantDto(tenant) });
  });

  return router;
}
