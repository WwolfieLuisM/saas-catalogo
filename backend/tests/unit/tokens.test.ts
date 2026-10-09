import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { getEnv } from '../../src/config/env.js';
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from '../../src/modules/auth/auth.tokens.js';

describe('access token', () => {
  it('hace roundtrip de claims válidos', async () => {
    const token = await signAccessToken({ id: 'u-1', role: 'ADMIN', tenantId: 't-javier' });
    const claims = await verifyAccessToken(token);

    expect(claims).toEqual({ id: 'u-1', role: 'ADMIN', tenantId: 't-javier', tokenVersion: 0 });
  });

  it('soporta tenantId nulo para SUPER_ADMIN', async () => {
    const token = await signAccessToken({ id: 'u-2', role: 'SUPER_ADMIN', tenantId: null });
    const claims = await verifyAccessToken(token);

    expect(claims.tenantId).toBeNull();
    expect(claims.role).toBe('SUPER_ADMIN');
  });

  it('conserva tokenVersion en los claims', async () => {
    const token = await signAccessToken({
      id: 'u-9',
      role: 'ADMIN',
      tenantId: 't-javier',
      tokenVersion: 3,
    });
    const claims = await verifyAccessToken(token);

    expect(claims.tokenVersion).toBe(3);
  });

  it('rechaza tokens sin tokenVersion', async () => {
    const legacy = await new SignJWT({
      role: 'ADMIN',
      tenantId: 't-javier',
      type: 'access',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-6')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(getEnv().JWT_ACCESS_SECRET));

    await expect(verifyAccessToken(legacy)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    });
  });

  it('rechaza tokens con firma inválida', async () => {
    const forged = await new SignJWT({ role: 'SUPER_ADMIN', type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-3')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('otro-secreto-distinto-del-definido-para-test'));

    await expect(verifyAccessToken(forged)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    });
  });

  it('rechaza tokens expirados', async () => {
    const expired = await new SignJWT({ role: 'ADMIN', tenantId: 't-javier', type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-4')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(getEnv().JWT_ACCESS_SECRET));

    await expect(verifyAccessToken(expired)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    });
  });

  it('rechaza tokens con rol inválido', async () => {
    const badRole = await new SignJWT({ role: 'HACKER', type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-5')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(getEnv().JWT_ACCESS_SECRET));

    await expect(verifyAccessToken(badRole)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    });
  });

  it('rechaza texto que no es un JWT', async () => {
    await expect(verifyAccessToken('no-es-un-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    });
  });
});

describe('refresh token', () => {
  it('genera tokens únicos y opacos', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('el hash es sha256 estable en hex', () => {
    const token = generateRefreshToken();

    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });
});
