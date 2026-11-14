import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: {
      '@gitroom/helpers': `${root}libraries/helpers/src`,
      '@gitroom/react': `${root}libraries/react-shared-libraries/src`,
      '@gitroom/frontend': `${root}apps/frontend/src`,
    },
  },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    include: [
      'apps/frontend/src/components/studio/*.spec.ts',
      'apps/frontend/src/components/studio/*.spec.tsx',
    ],
    maxWorkers: 1,
    testTimeout: 15000,
  },
});
