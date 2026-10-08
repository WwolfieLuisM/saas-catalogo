import type { AddressInfo } from 'node:net';
import argon2 from 'argon2';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';

process.env.LOGIN_RATE_LIMIT_MAX = '1000';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => fakeDb, closePrisma: async () => undefined };
});

import { addFakeUser, resetFakeDb, state, type FakeAdminUser } from '../helpers/fakeDb.js';

const PASSWORD = 'Sup3rSecret!Pass';

let server: Server;
let baseUrl: string;
let passwordHash: string;

function userRow(overrides: Partial<FakeAdminUser> = {}): FakeAdminUser {
  return {
    id: 'u-admin',
    username: 'javier-admin',
    passwordHash,
    role: 'ADMIN',
    tenantId: 't-javier',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function login(username: string, password: string) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = (await response.json()) as {
    success: boolean;
    data?: { accessToken: string; expiresIn: number; user: Record<string, unknown> };
    error?: { code: string };
  };
  const setCookie = response.headers.get('set-cookie');
  const cookieMatch = setCookie ? /refresh_token=([^;]+)/.exec(setCookie) : null;

  return { response, body, cookie: cookieMatch?.[1] ?? null };
}

beforeAll(async () => {
  const { createApp } = await import('../../src/app.js');
  passwordHash = await argon2.hash(PASSWORD);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetFakeDb();
  addFakeUser(userRow());
  addFakeUser(userRow({ id: 'u-super', username: 'root', role: 'SUPER_ADMIN', tenantId: null }));
  addFakeUser(userRow({ id: 'u-disabled', username: 'disabled-admin', isActive: false }));
});

describe('POST /api/v1/auth/login', () => {
  it('devuelve access token, setea cookie de refresh y no filtra password', async () => {
    const { response, body, cookie } = await login('javier-admin', PASSWORD);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.accessToken).toEqual(expect.any(String));
    expect(body.data?.expiresIn).toBe(900);
    expect(body.data?.user).toMatchObject({
      id: 'u-admin',
      username: 'javier-admin',
      role: 'ADMIN',
      tenantId: 't-javier',
    });
    expect(body.data).not.toHaveProperty('password');
    expect(body.data).not.toHaveProperty('passwordHash');
    expect(cookie).toBeTruthy();

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/api/v1/auth');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('devuelve 401 con credenciales inválidas para password incorrecta', async () => {
    const { response, body } = await login('javier-admin', 'wrong-password');

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe('INVALID_CREDENTIALS');
  });

  it('devuelve el mismo error para usuario inexistente', async () => {
    const { response, body } = await login('no-existe', PASSWORD);

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe('INVALID_CREDENTIALS');
  });

  it('devuelve 401 para cuentas desactivadas', async () => {
    const { response, body } = await login('disabled-admin', PASSWORD);

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe('INVALID_CREDENTIALS');
  });

  it('devuelve 400 VALIDATION_ERROR si falta el password', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'javier-admin' }),
    });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignora tenantId enviado por el cliente', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'javier-admin', password: PASSWORD, tenantId: 't_evil' }),
    });
    const body = (await response.json()) as {
      data: { user: { tenantId: string } };
    };

    expect(response.status).toBe(200);
    expect(body.data.user.tenantId).toBe('t-javier');
  });

  it('actualiza lastLoginAt tras login exitoso', async () => {
    await login('javier-admin', PASSWORD);

    const user = state.users.get('u-admin');
    expect(user?.lastLoginAt).toBeInstanceOf(Date);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rota el refresh token y devuelve un nuevo access token', async () => {
    const first = await login('javier-admin', PASSWORD);
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refresh_token=${first.cookie}` },
    });
    const body = (await response.json()) as {
      data: { accessToken: string };
    };
    const setCookie = response.headers.get('set-cookie') ?? '';
    const rotated = /refresh_token=([^;]+)/.exec(setCookie)?.[1];

    expect(response.status).toBe(200);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(first.cookie);

    const previous = [...state.sessions.values()].find((session) => session.revokedAt !== null);
    expect(previous).toBeDefined();
  });

  it('devuelve 401 sin cookie de refresh', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, { method: 'POST' });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('REFRESH_TOKEN_REQUIRED');
  });

  it('devuelve 401 para un refresh token inventado', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: 'refresh_token=token-inventado' },
    });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('detecta reuso de un token rotado y revoca la familia de sesiones', async () => {
    const first = await login('javier-admin', PASSWORD);
    const refreshResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refresh_token=${first.cookie}` },
    });
    const rotatedCookie =
      /refresh_token=([^;]+)/.exec(refreshResponse.headers.get('set-cookie') ?? '')?.[1] ?? '';

    const reuseResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refresh_token=${first.cookie}` },
    });
    const reuseBody = (await reuseResponse.json()) as { error: { code: string } };

    expect(reuseResponse.status).toBe(401);
    expect(reuseBody.error.code).toBe('REFRESH_REUSE_DETECTED');

    const afterReuse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refresh_token=${rotatedCookie}` },
    });
    expect(afterReuse.status).toBe(401);
    expect([...state.sessions.values()].every((session) => session.revokedAt !== null)).toBe(true);
  });

  it('devuelve 401 si la cuenta fue desactivada', async () => {
    const { cookie } = await login('javier-admin', PASSWORD);
    const user = state.users.get('u-admin');
    if (user) user.isActive = false;

    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refresh_token=${cookie}` },
    });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revoca la sesión y limpia la cookie', async () => {
    const { cookie } = await login('javier-admin', PASSWORD);
    const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { cookie: `refresh_token=${cookie}` },
    });
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(response.headers.get('set-cookie') ?? '').toContain('refresh_token=;');
    expect([...state.sessions.values()].every((session) => session.revokedAt !== null)).toBe(true);

    const afterLogout = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refresh_token=${cookie}` },
    });
    expect(afterLogout.status).toBe(401);
  });

  it('es idempotente sin cookie', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/logout`, { method: 'POST' });

    expect(response.status).toBe(200);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('devuelve 401 sin token', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/me`);
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve el perfil del usuario autenticado', async () => {
    const { body: loginBody } = await login('javier-admin', PASSWORD);
    const accessToken = loginBody.data?.accessToken ?? '';

    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = (await response.json()) as {
      data: { id: string; username: string; role: string; tenantId: string | null };
    };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: 'u-admin',
      username: 'javier-admin',
      role: 'ADMIN',
      tenantId: 't-javier',
    });
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  it('deriva tenantId de la base de datos, nunca del token', async () => {
    const forged = await signAccessToken({
      id: 'u-admin',
      role: 'ADMIN',
      tenantId: 't_evil',
    });

    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${forged}` },
    });
    const body = (await response.json()) as { data: { tenantId: string } };

    expect(response.status).toBe(200);
    expect(body.data.tenantId).toBe('t-javier');
  });

  it('devuelve 401 con token basura', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: 'Bearer no-es-un-token' },
    });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_TOKEN');
  });

  it('devuelve 401 si el usuario de la sesión fue desactivado', async () => {
    const { body: loginBody } = await login('javier-admin', PASSWORD);
    const accessToken = loginBody.data?.accessToken ?? '';
    const user = state.users.get('u-admin');
    if (user) user.isActive = false;

    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.status).toBe(401);
  });
});
