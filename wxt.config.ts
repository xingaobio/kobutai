import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

/**
 * E2E builds go to their own folder with host access pre-granted: Playwright can't click Chrome's
 * native permission prompt, and an already granted permissions.request() resolves without one.
 */
const E2E = !!process.env.HAPPYDESK_E2E;

const shim = (name: string) => fileURLToPath(new URL(`./src/lib/llm/shims/${name}.ts`, import.meta.url));

export default defineConfig({
  srcDir: 'src',
  outDir: E2E ? '.output-e2e' : '.output',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'zh_CN',
    homepage_url: 'https://kobutai.pages.dev',
    permissions: ['storage', 'alarms'],
    // Requested at runtime, per origin: a character library on a host without CORS, or a model
    // provider the user connects (its API and sign-in hosts; localhost to finish browser sign-in;
    // http for self-hosted model servers).
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    ...(E2E ? { host_permissions: ['https://*/*', 'http://*/*'] } : {}),
    // use_dynamic_url: pages can't probe chrome-extension://<id>/packs/… to detect the extension.
    web_accessible_resources: [{ resources: ['packs/*', 'emoji/*'], matches: ['<all_urls>'], use_dynamic_url: true }],
    action: { default_title: 'Kobutai' },
  },
  vite: () => ({
    // pi-ai's sign-in flows import a loopback server and randomBytes; see src/lib/llm/shims.
    resolve: { alias: { 'node:http': shim('node-http'), 'node:crypto': shim('node-crypto') } },
  }),
});
