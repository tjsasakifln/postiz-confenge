import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  resolve: { alias: {
    '@gitroom/helpers': `${root}libraries/helpers/src`,
    '@gitroom/nestjs-libraries': `${root}libraries/nestjs-libraries/src`,
    '@gitroom/backend': `${root}apps/backend/src`,
  } },
  test: {
    environment: 'node', globals: true, maxWorkers: 1, testTimeout: 15000,
    include: ['tests/**/*.spec.ts'],
  },
});
