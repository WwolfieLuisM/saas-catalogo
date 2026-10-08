import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.LOGIN_RATE_LIMIT_MAX = '5';

vi.mock('../../src/config/database.js', () => ({
  getPrisma: () => ({
    adminUser: {
      findUnique: async () => null,
      update: async () => null,
    },
    adminSession: {
      create: async () => null,
      findUnique: async () => null,
      update: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  }),
  closePrisma: async () => undefined,
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { createApp } = await import('../../src/app.js');
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
  vi.useRealTimers();
});

describe('rate limiting en login', () => {
  it('responde 429 RATE_LIMITED tras superar el límite de intentos', async () => {
    let lastStatus = 0;
    let lastBody: { error?: { code?: string } } = {};

    for (let attempt = 0; attempt <= 5; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'cualquiera', password: 'mal' }),
      });
      lastStatus = response.status;
      lastBody = (await response.json()) as { error?: { code?: string } };

      if (response.status === 429) break;
    }

    expect(lastStatus).toBe(429);
    expect(lastBody.error?.code).toBe('RATE_LIMITED');
  });
});
