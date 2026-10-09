import type { RequestHandler } from 'express';
import { getPrisma } from '../config/database.js';
import type { Role } from '../generated/client.js';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import { AppError } from '../utils/appError.js';

export interface AuthContext {
  id: string;
  username: string;
  role: Role;
  tenantId: string | null;
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;

    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
    }

    const payload = await verifyAccessToken(header.slice(7));
    const user = await getPrisma().adminUser.findUnique({ where: { id: payload.id } });

    if (!user || !user.isActive) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cuenta inválida o desactivada');
    }

    if (user.tenantId) {
      const tenant = await getPrisma().tenant.findUnique({ where: { id: user.tenantId } });

      if (!tenant || !tenant.isActive) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Cuenta inválida o desactivada');
      }
    }

    req.auth = {
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export function requireRoles(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida'));
      return;
    }

    if (!roles.includes(req.auth.role)) {
      next(new AppError(403, 'FORBIDDEN', 'No tienes permisos para esta operación'));
      return;
    }

    next();
  };
}
