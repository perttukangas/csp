import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['tabs', 'activeTab', 'storage', 'unlimitedStorage'],
    browser_specific_settings: {
      gecko: {
        id: 'web-scraiper@csp.dev',
      },
    },
  },
});
