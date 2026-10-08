import argon2 from 'argon2';
import type { Request } from 'express';
import { getPrisma } from '../../config/database.js';
import { getEnv } from '../../config/env.js';
import type { Role } from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';
import { parseDurationToSeconds } from '../../utils/duration.js';
import { generateRefreshToken, hashToken, signAccessToken } from './auth.tokens.js';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$NC0S/NqFK8QWu9GcqNgflg$/2pqXE5i9Tu5acAMA6unk+/xwnL/LS1XdWBQprc/qoQ';

export interface RequestMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface UserPayload {
  id: string;
  username: string;
  role: Role;
  tenantId: string | null;
}

export interface AuthResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  user: UserPayload;
}

interface AdminRow {
  id: string;
  username: string;
  role: Role;
  tenantId: string | null;
  isActive: boolean;
}

function profile(user: AdminRow): UserPayload {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId,
  };
}

async function buildResult(user: AdminRow, refreshToken: string): Promise<AuthResult> {
  const env = getEnv();

  return {
    accessToken: await signAccessToken({
      id: user.id,
      role: user.role,
      tenantId: user.tenantId,
    }),
    accessTokenExpiresIn: parseDurationToSeconds(env.ACCESS_TOKEN_EXPIRES_IN),
    refreshToken,
    user: profile(user),
  };
}

export function requestMeta(req: Request): RequestMeta {
  return {
    userAgent: req.get('user-agent') ?? null,
    ipAddress: req.ip ?? null,
  };
}

export async function login(
  input: { username: string; password: string } & RequestMeta,
): Promise<AuthResult> {
  const prisma = getPrisma();
  const invalid = new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
  const user = await prisma.adminUser.findUnique({ where: { username: input.username } });

  if (!user) {
    await argon2.verify(DUMMY_PASSWORD_HASH, input.password).catch(() => false);
    throw invalid;
  }

  if (!user.isActive) {
    throw invalid;
  }

  const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false);

  if (!valid) {
    throw invalid;
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const env = getEnv();
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(
    Date.now() + parseDurationToSeconds(env.REFRESH_TOKEN_EXPIRES_IN) * 1000,
  );

  await prisma.adminSession.create({
    data: {
      adminId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    },
  });

  return buildResult(user, refreshToken);
}

export async function refresh(
  input: { refreshToken: string | null } & RequestMeta,
): Promise<AuthResult> {
  const prisma = getPrisma();

  if (!input.refreshToken) {
    throw new AppError(401, 'REFRESH_TOKEN_REQUIRED', 'Refresh token requerido');
  }

  const tokenHash = hashToken(input.refreshToken);
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: { admin: true },
  });

  if (!session) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token inválido');
  }

  if (session.revokedAt) {
    await prisma.adminSession.updateMany({
      where: { adminId: session.adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(401, 'REFRESH_REUSE_DETECTED', 'Sesión revocada por seguridad');
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, 'REFRESH_EXPIRED', 'Refresh token expirado');
  }

  if (!session.admin.isActive) {
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw new AppError(401, 'ACCOUNT_DISABLED', 'Cuenta desactivada');
  }

  const env = getEnv();
  const newRefreshToken = generateRefreshToken();
  const expiresAt = new Date(
    Date.now() + parseDurationToSeconds(env.REFRESH_TOKEN_EXPIRES_IN) * 1000,
  );

  await prisma.$transaction([
    prisma.adminSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    }),
    prisma.adminSession.create({
      data: {
        adminId: session.adminId,
        tokenHash: hashToken(newRefreshToken),
        expiresAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      },
    }),
  ]);

  return buildResult(session.admin, newRefreshToken);
}

export async function logout(refreshToken: string | null): Promise<void> {
  if (!refreshToken) {
    return;
  }

  await getPrisma().adminSession.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string): Promise<UserPayload> {
  const user = await getPrisma().adminUser.findUnique({ where: { id: userId } });

  if (!user || !user.isActive) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Cuenta inválida o desactivada');
  }

  return profile(user);
}
