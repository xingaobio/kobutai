import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'HappyDesk',
    description: 'A floating mascot that reacts to what you play and controls media across tabs.',
    permissions: ['storage'],
    // Requested at runtime only when the user adds a library on a host without CORS.
    optional_host_permissions: ['https://*/*'],
    // use_dynamic_url: pages can't probe chrome-extension://<id>/packs/… to detect the extension.
    web_accessible_resources: [{ resources: ['packs/*'], matches: ['<all_urls>'], use_dynamic_url: true }],
    action: { default_title: 'HappyDesk' },
  },
});
