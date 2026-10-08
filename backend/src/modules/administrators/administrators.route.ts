import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { buildMeta } from '../../utils/pagination.js';
import { requestMeta } from '../../utils/requestMeta.js';
import {
  administratorIdParamSchema,
  administratorListQuerySchema,
  createAdministratorSchema,
  updateAdministratorSchema,
} from './administrators.schemas.js';
import * as administratorsService from './administrators.service.js';

export function createAdministratorsRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRoles('SUPER_ADMIN'));

  router.get('/', async (req, res) => {
    const query = administratorListQuerySchema.parse(req.query);
    const { items, total } = await administratorsService.listAdministrators(query);

    res.json({
      success: true,
      data: items.map(administratorsService.administratorDto),
      meta: buildMeta(total, query.page, query.limit),
    });
  });

  router.post('/', async (req, res) => {
    const body = createAdministratorSchema.parse(req.body);
    const admin = await administratorsService.createAdministrator(
      body,
      req.auth ?? null,
      requestMeta(req),
    );

    res.status(201).json({ success: true, data: administratorsService.administratorDto(admin) });
  });

  router.get('/:id', async (req, res) => {
    const { id } = administratorIdParamSchema.parse(req.params);
    const admin = await administratorsService.getAdministrator(id);

    res.json({ success: true, data: administratorsService.administratorDto(admin) });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = administratorIdParamSchema.parse(req.params);
    const body = updateAdministratorSchema.parse(req.body);
    const admin = await administratorsService.updateAdministrator(
      id,
      body,
      req.auth ?? null,
      requestMeta(req),
    );

    res.json({ success: true, data: administratorsService.administratorDto(admin) });
  });

  router.post('/:id/revoke-sessions', async (req, res) => {
    const { id } = administratorIdParamSchema.parse(req.params);
    const revoked = await administratorsService.revokeSessions(
      id,
      req.auth ?? null,
      requestMeta(req),
    );

    res.json({ success: true, data: { revoked } });
  });

  return router;
}
