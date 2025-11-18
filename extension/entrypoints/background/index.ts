import { BackgroundService } from './BackgroundService';

export default defineBackground({
  type: 'module',
  main() {
    console.log('🚀 BACKGROUND SCRIPT LOADED!', new Date().toISOString());
    console.warn(
      'Background script is running - check chrome://extensions/ -> Inspect views'
    );

    // Set a visible badge to confirm the script is running
    browser.action?.setBadgeText({ text: '✓' });
    browser.action?.setBadgeBackgroundColor({ color: '#4CAF50' });

    const backgroundService = new BackgroundService();

    // Bind the handleMessage method properly to maintain 'this' context
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      return backgroundService.handleMessage(message, sender, sendResponse);
    });

    // Listen for tab updates (URL changes)
    browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      // Only process when URL actually changes and is complete
      if (changeInfo.status === 'complete' && tab.url) {
        console.log('Tab URL changed:', tab.url);
        const result = await backgroundService.storeUrlForLater(tab.url, undefined, tabId);

        // If HTML capture is needed, notify the content script
        if (result.requiresAuth || result.forceHtmlCapture) {
          console.log('📨 Notifying content script to capture HTML for:', tab.url);
          try {
            await browser.tabs.sendMessage(tabId, {
              type: 'CAPTURE_HTML',
              url: tab.url,
            });
          } catch (error) {
            console.error('Failed to send CAPTURE_HTML message to tab:', error);
          }
        }
      }
    });

    // Listen for tab activation (switching between tabs)
    browser.tabs.onActivated.addListener(async activeInfo => {
      try {
        const tab = await browser.tabs.get(activeInfo.tabId);
        if (tab.url) {
          console.log('Tab activated:', tab.url);
          const result = await backgroundService.storeUrlForLater(
            tab.url,
            undefined,
            activeInfo.tabId
          );

          // If HTML capture is needed, notify the content script
          if (result.requiresAuth || result.forceHtmlCapture) {
            console.log('📨 Notifying content script to capture HTML for:', tab.url);
            try {
              await browser.tabs.sendMessage(activeInfo.tabId, {
                type: 'CAPTURE_HTML',
                url: tab.url,
              });
            } catch (error) {
              console.error('Failed to send CAPTURE_HTML message to tab:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error getting active tab:', error);
      }
    });
  },
});
