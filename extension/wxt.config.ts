import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['tabs', 'activeTab', 'storage', 'unlimitedStorage'],
    host_permissions: [
      'http://localhost:3000/*',
      'http://localhost:8080/*',
      'http://127.0.0.1:*/*',
    ],
  },
});
