import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      LOG_LEVEL: 'silent',
      LOGIN_RATE_LIMIT_MAX: '1000',
      RATE_LIMIT_MAX: '100000',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789abcdef',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef0123456789abcdef',
      CLOUDINARY_CLOUD_NAME: 'test',
      CLOUDINARY_API_KEY: 'test',
      CLOUDINARY_API_SECRET: 'test',
    },
  },
});
