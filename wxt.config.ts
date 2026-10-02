import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'zh_CN',
    homepage_url: 'https://github.com/xingaobio/happydesk',
    permissions: ['storage', 'alarms'],
    // Requested at runtime only when the user adds a library on a host without CORS.
    optional_host_permissions: ['https://*/*'],
    // use_dynamic_url: pages can't probe chrome-extension://<id>/packs/… to detect the extension.
    web_accessible_resources: [{ resources: ['packs/*'], matches: ['<all_urls>'], use_dynamic_url: true }],
    action: { default_title: 'HappyDesk' },
  },
});
