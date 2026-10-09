import { Router } from 'express';
import { catalogQuerySchema, catalogSyncQuerySchema } from './catalog.schemas.js';
import { getCatalog, getCatalogSync, getCatalogVersion } from './catalog.service.js';

function etagFor(version: number): string {
  return `"v${version}"`;
}

function isFresh(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  return ifNoneMatch.split(',').some((candidate) => {
    const value = candidate.trim().replace(/^W\//, '');
    return value === '*' || value === etag;
  });
}

export function createCatalogRouter(): Router {
  const router = Router();

  router.get('/version', async (req, res) => {
    const query = catalogQuerySchema.parse(req.query);
    const data = await getCatalogVersion(query.tenant as string);
    const etag = etagFor(data.version);

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');

    if (isFresh(req.headers['if-none-match'], etag)) {
      res.status(304).end();
      return;
    }

    res.json({ success: true, data });
  });

  router.get('/', async (req, res) => {
    const query = catalogQuerySchema.parse(req.query);
    const data = await getCatalog(query.tenant as string);
    const etag = etagFor(data.version);

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');

    if (isFresh(req.headers['if-none-match'], etag)) {
      res.status(304).end();
      return;
    }

    res.json({ success: true, data });
  });

  router.get('/sync', async (req, res) => {
    const query = catalogSyncQuerySchema.parse(req.query);
    const since = query.since === undefined ? undefined : Number(query.since);
    const data = await getCatalogSync(query.tenant as string, since);

    res.setHeader('Cache-Control', 'no-cache');
    res.json({ success: true, data });
  });

  return router;
}
