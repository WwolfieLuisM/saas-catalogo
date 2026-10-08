import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '../../config/env.js';
import type { Role } from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';

export interface AccessTokenClaims {
  id: string;
  role: Role;
  tenantId: string | null;
}

function accessKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().JWT_ACCESS_SECRET);
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({
    role: claims.role,
    tenantId: claims.tenantId,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.id)
    .setIssuedAt()
    .setExpirationTime(getEnv().ACCESS_TOKEN_EXPIRES_IN)
    .sign(accessKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, accessKey(), { algorithms: ['HS256'] });

    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      (payload.role !== 'SUPER_ADMIN' && payload.role !== 'ADMIN')
    ) {
      throw new Error('invalid claims');
    }

    return {
      id: payload.sub,
      role: payload.role,
      tenantId: typeof payload.tenantId === 'string' ? payload.tenantId : null,
    };
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Token inválido o expirado');
  }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
