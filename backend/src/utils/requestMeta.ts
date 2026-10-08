import type { Request } from 'express';

export interface RequestMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

export function requestMeta(req: Request): RequestMeta {
  return {
    userAgent: req.get('user-agent') ?? null,
    ipAddress: req.ip ?? null,
  };
}
