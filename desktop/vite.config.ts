import { fileURLToPath } from 'node:url';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Shared by the dev server, the build and the unit tests (desktop/vitest.config.ts). */
export const sharedConfig = {
  // Same Svelte setup as the extension build (@wxt-dev/module-svelte).
  plugins: [svelte({ configFile: false, preprocess: [vitePreprocess()] })],
  resolve: {
    alias: {
      '@': here('../src'),
      // WXT's virtual module: `storage` (and `browser`) for the shared code in src/.
      '#imports': here('./ui/shims/imports.ts'),
    },
    conditions: ['browser'],
  },
};

// The Rust side starts this dev server (tauri.conf.json: devUrl) and builds into desktop/dist.
export default defineConfig(({ mode }) => ({
  ...sharedConfig,
  root: here('.'),
  // Built-in characters, the classifier model, emoji and fonts are served from the app's root
  // (/packs/index.json, /model/..., /emoji/...), exactly as the extension ships them.
  publicDir: here('../public'),
  clearScreen: false,
  // TAURI_ENV_* are set by `tauri dev/build`; expose them to the page.
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  server: {
    port: 1420,
    strictPort: true,
    // The shared code lives outside this folder.
    fs: { allow: [here('..')] },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  preview: { port: 4173, strictPort: true },
  build: {
    outDir: here('./dist'),
    emptyOutDir: true,
    // WebView2 is Chromium; keep sourcemaps out of release bundles.
    sourcemap: mode === 'development',
    chunkSizeWarningLimit: 1500,
  },
}));
