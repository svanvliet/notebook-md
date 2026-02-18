import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/tests/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
      DB_NAME: 'notebookmd_test',
    },
  },
});
