import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://wormhole:wormhole@localhost:5432/wormhole_test',
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret-min-32-chars-long!!!!!!!!',
      JWT_ISSUER: 'wormhole-api',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? '0'.repeat(64),
    },
    globals: true,
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
