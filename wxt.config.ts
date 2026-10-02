import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'HappyDesk',
    description: 'A floating mascot that reacts to what you play and controls media across tabs.',
    permissions: ['storage'],
    web_accessible_resources: [{ resources: ['packs/*'], matches: ['<all_urls>'] }],
    action: { default_title: 'HappyDesk' },
  },
});
