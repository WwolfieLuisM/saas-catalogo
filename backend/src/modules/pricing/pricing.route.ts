import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requestMeta } from '../../utils/requestMeta.js';
import {
  applyPricing,
  createRule,
  deleteRule,
  listRules,
  previewPricing,
  updateRule,
} from './pricing.service.js';
import {
  createPricingRuleSchema,
  pricingActionSchema,
  pricingRuleIdParamSchema,
  pricingTenantQuerySchema,
  updatePricingRuleSchema,
} from './pricing.schemas.js';

export function createPricingRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get('/rules', async (req, res) => {
    const query = pricingTenantQuerySchema.parse(req.query);
    const data = await listRules(req.auth ?? null, query.tenantId);

    res.json({ success: true, data });
  });

  router.post('/rules', async (req, res) => {
    const body = createPricingRuleSchema.parse(req.body ?? {});
    const data = await createRule(body, req.auth ?? null, requestMeta(req));

    res.status(201).json({ success: true, data });
  });

  router.patch('/rules/:id', async (req, res) => {
    const { id } = pricingRuleIdParamSchema.parse(req.params);
    const body = updatePricingRuleSchema.parse(req.body ?? {});
    const data = await updateRule(id, body, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  router.delete('/rules/:id', async (req, res) => {
    const { id } = pricingRuleIdParamSchema.parse(req.params);
    const data = await deleteRule(id, req.auth ?? null, requestMeta(req));

    res.json({ success: true, data });
  });

  router.post('/preview', async (req, res) => {
    const body = pricingActionSchema.parse(req.body ?? {});
    const data = await previewPricing(req.auth ?? null, body.tenantId);

    res.json({ success: true, data });
  });

  router.post('/apply', async (req, res) => {
    const body = pricingActionSchema.parse(req.body ?? {});
    const data = await applyPricing(req.auth ?? null, body.tenantId, requestMeta(req));

    res.json({ success: true, data });
  });

  return router;
}
