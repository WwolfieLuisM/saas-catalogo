import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { getEnv } from '../../config/env.js';
import { authenticate } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import { requestMeta } from '../../utils/requestMeta.js';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './auth.cookies.js';
import { loginSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

function readRefreshCookie(req: Request): string | null {
  const value = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function authResponse(result: authService.AuthResult) {
  return {
    accessToken: result.accessToken,
    expiresIn: result.accessTokenExpiresIn,
    user: result.user,
  };
}

export function createAuthRouter(): Router {
  const router = Router();
  const env = getEnv();

  const loginLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.LOGIN_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes, intenta más tarde'));
    },
  });

  router.post('/login', loginLimiter, async (req: Request, res: Response) => {
    const body = loginSchema.parse(req.body);
    const result = await authService.login({ ...body, ...requestMeta(req) });

    setRefreshCookie(res, result.refreshToken);
    res.json({ success: true, data: authResponse(result) });
  });

  router.post('/refresh', async (req: Request, res: Response) => {
    const result = await authService.refresh({
      refreshToken: readRefreshCookie(req),
      ...requestMeta(req),
    });

    setRefreshCookie(res, result.refreshToken);
    res.json({ success: true, data: authResponse(result) });
  });

  router.post('/logout', async (req: Request, res: Response) => {
    await authService.logout(readRefreshCookie(req));

    clearRefreshCookie(res);
    res.json({ success: true, data: null });
  });

  router.get('/me', authenticate, async (req: Request, res: Response) => {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
    }

    const user = await authService.getMe(req.auth.id);
    res.json({ success: true, data: user });
  });

  return router;
}
