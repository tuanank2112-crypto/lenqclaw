import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    environment: 'node',
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false,
  },
});
