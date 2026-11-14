import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      '@gitroom/helpers': `${root}libraries/helpers/src`,
      '@gitroom/nestjs-libraries': `${root}libraries/nestjs-libraries/src`,
      '@gitroom/backend': `${root}apps/backend/src`,
      '@gitroom/orchestrator': `${root}apps/orchestrator/src`,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    maxWorkers: 1,
    testTimeout: 120000,
    hookTimeout: 120000,
    include: [
      'libraries/**/*studio*.spec.ts',
      'libraries/**/studio/**/*.spec.ts',
      'libraries/**/studio/**/*.test.ts',
    ],
  },
});
