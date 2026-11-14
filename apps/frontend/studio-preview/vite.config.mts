import { defineConfig } from 'vite';
import tailwind from 'tailwindcss';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const preview = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const tailwindConfig = require('../tailwind.config.cjs');

// This entry is explicitly outside the product route tree. Every service is a
// labelled, in-memory fixture. Unknown requests fail and never reach a backend.
export default defineConfig({
  root: preview,
  publicDir: false,
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      {
        find: '@gitroom/helpers/utils/custom.fetch',
        replacement: `${preview}fetch.ts`,
      },
      {
        find: '@gitroom/frontend/components/media/media.component',
        replacement: `${preview}media.ts`,
      },
      {
        find: '@gitroom/frontend/components/media/new.uploader',
        replacement: `${preview}media.ts`,
      },
      { find: 'next/navigation', replacement: `${preview}navigation.ts` },
      { find: 'next/link', replacement: `${preview}link.tsx` },
      {
        find: '@gitroom/helpers',
        replacement: `${repository}libraries/helpers/src`,
      },
      {
        find: '@gitroom/react',
        replacement: `${repository}libraries/react-shared-libraries/src`,
      },
      {
        find: '@gitroom/frontend',
        replacement: `${repository}apps/frontend/src`,
      },
    ],
  },
  css: {
    postcss: {
      plugins: [
        tailwind({
          ...tailwindConfig,
          content: [
            `${repository}apps/frontend/src/components/studio/**/*.{ts,tsx}`,
            `${repository}libraries/react-shared-libraries/src/form/button.tsx`,
            `${preview}*.tsx`,
          ],
        }),
      ],
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4311,
    strictPort: true,
    fs: { allow: [repository] },
  },
});
