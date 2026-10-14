import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { sharedConfig } from './vite.config.ts';

export default defineConfig({
  ...sharedConfig,
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'happy-dom',
    include: ['ui/**/*.test.ts'],
  },
});
