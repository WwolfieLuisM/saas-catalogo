import { describe, expect, it } from 'vitest';
import { envSchema } from '../../src/config/env.js';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  CLOUDINARY_CLOUD_NAME: 'cloud',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
};

describe('envSchema', () => {
  it('acepta variables válidas y aplica defaults', () => {
    const result = envSchema.safeParse(baseEnv);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.PORT).toBe(3000);
    expect(result.data.NODE_ENV).toBe('development');
    expect(result.data.COOKIE_SECURE).toBe(false);
    expect(result.data.COOKIE_SAME_SITE).toBe('lax');
    expect(result.data.ACCESS_TOKEN_EXPIRES_IN).toBe('15m');
    expect(result.data.RATE_LIMIT_MAX).toBe(100);
  });

  it('rechaza DATABASE_URL ausente', () => {
    const { DATABASE_URL: _missing, ...rest } = baseEnv;
    const result = envSchema.safeParse(rest);

    expect(result.success).toBe(false);
  });

  it('rechaza secrets cortos', () => {
    const result = envSchema.safeParse({ ...baseEnv, JWT_ACCESS_SECRET: 'corto' });

    expect(result.success).toBe(false);
  });

  it('convierte COOKIE_SECURE de string a boolean', () => {
    const result = envSchema.safeParse({ ...baseEnv, COOKIE_SECURE: 'true' });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.COOKIE_SECURE).toBe(true);
  });

  it('convierte PORT a number', () => {
    const result = envSchema.safeParse({ ...baseEnv, PORT: '8080' });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.PORT).toBe(8080);
  });

  it('rechaza NODE_ENV inválido', () => {
    const result = envSchema.safeParse({ ...baseEnv, NODE_ENV: 'staging' });

    expect(result.success).toBe(false);
  });

  it('fuerza COOKIE_SECURE en producción', () => {
    const result = envSchema.safeParse({ ...baseEnv, NODE_ENV: 'production' });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.COOKIE_SECURE).toBe(true);
  });

  it('no altera COOKIE_SECURE fuera de producción', () => {
    const result = envSchema.safeParse({ ...baseEnv, NODE_ENV: 'development' });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.COOKIE_SECURE).toBe(false);
  });
});
