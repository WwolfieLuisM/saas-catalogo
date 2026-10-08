import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
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

describe('GET /api/v1/health', () => {
  it('responde con el formato de éxito', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    const body = (await response.json()) as {
      success: boolean;
      data: { status: string; database: string; timestamp: string };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).not.toBeNull();
    expect(body.success).toBe(true);
    expect(['ok', 'degraded']).toContain(body.data.status);
    expect(['ok', 'error']).toContain(body.data.database);
    expect(new Date(body.data.timestamp).getTime()).not.toBeNaN();
  });
});

describe('rutas desconocidas', () => {
  it('devuelve 404 con formato de error', async () => {
    const response = await fetch(`${baseUrl}/api/v1/no-existe`);
    const body = (await response.json()) as {
      success: boolean;
      error: { code: string };
    };

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
