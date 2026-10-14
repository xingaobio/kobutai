import { defineConfig } from '@playwright/test';

/**
 * Smoke test of the desktop UI in plain Chromium, with Tauri's IPC replaced by a stub.
 * `npm run desktop:e2e` builds desktop/dist first and serves it with `vite preview`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 720 } },
  webServer: {
    command: 'npx vite preview --config desktop/vite.config.ts',
    cwd: '..',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
