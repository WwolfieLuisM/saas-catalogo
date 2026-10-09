import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.js';
import { dashboardQuerySchema } from './dashboard.schemas.js';
import * as dashboardService from './dashboard.service.js';

export function createDashboardRouter(): Router {
  const router = Router();

  router.use(authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'));

  router.get('/', async (req, res) => {
    const query = dashboardQuerySchema.parse(req.query);
    const data = await dashboardService.getDashboard(req.auth ?? null, query);

    res.json({ success: true, data });
  });

  return router;
}
