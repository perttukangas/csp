import { BackgroundService } from './BackgroundService';

export default defineBackground({
  type: 'module',
  main() {
    const backgroundService = new BackgroundService();

    browser.runtime.onMessage.addListener(backgroundService.handleMessage);

    // Listen for tab updates (URL changes)
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // Only process when URL actually changes and is complete
      if (changeInfo.status === 'complete' && tab.url) {
        console.log('Tab URL changed:', tab.url);
        backgroundService.sendUrlToServer(tab.url, tabId);
      }
    });

    // Listen for tab activation (switching between tabs)
    browser.tabs.onActivated.addListener(async activeInfo => {
      try {
        const tab = await browser.tabs.get(activeInfo.tabId);
        if (tab.url) {
          console.log('Tab activated:', tab.url);
          backgroundService.sendUrlToServer(tab.url, activeInfo.tabId);
        }
      } catch (error) {
        console.error('Error getting active tab:', error);
      }
    });
  },
});
