import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Include 'downloads' so the background script can trigger CSV downloads
    permissions: [
      'tabs',
      'activeTab',
      'storage',
      'unlimitedStorage',
      'downloads',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'web-scraiper@csp.dev',
      },
    },
  },
});
