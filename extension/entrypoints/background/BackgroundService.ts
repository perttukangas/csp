export class BackgroundService {
  async getPropmpt() {
    try {
      const result = await browser.storage.sync.get(['prompt']);
      return result.prompt || '';
    } catch (error) {
      console.error('Failed to get prompt:', error);
      return undefined;
    }
  }

  async isTrackingEnabled(): Promise<boolean> {
    try {
      const result = await browser.storage.sync.get(['urlTrackingEnabled']);
      return result.urlTrackingEnabled || false;
    } catch (error) {
      console.error('Failed to check tracking status:', error);
      return false;
    }
  }

  async getSessionId(): Promise<void> {
    /**
     * TODO: Probably we will need it to avoid repeated sending of prompt
     * and to somehow accumulate context.
     */
  }

  async sendUrlToServer(url: string, tabId?: number) {
    const trackingEnabled = await this.isTrackingEnabled();
    if (!trackingEnabled) {
      console.log('🚫 URL tracking disabled, skipping:', url);
      return { success: false, error: 'URL tracking is disabled' };
    }

    console.log('📤 Sending URL to server (tracking enabled):', url);
    try {
      const propmt = await this.getPropmpt();
      // TODO: Change to actual url. I have had troubles with
      // our local server.
      const response = await fetch('http://localhost:8000/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          tabId,
          timestamp: Date.now(),
          prompt: propmt,
        }),
      });

      if (response.ok) {
        console.log('✅ URL sent to server successfully:', url);
        return { success: true };
      } else {
        console.error('❌ Server returned error:', response.status);
        return { success: false, error: `Server error: ${response.status}` };
      }
    } catch (error) {
      console.error('💥 Failed to send URL to server:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  handleMessage(
    message: any,
    sender: globalThis.Browser.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) {
    if (message.type === 'URL_CHANGED') {
      console.log('📨 Received URL change from content script:', message.url);

      // Handle async response properly
      this.sendUrlToServer(message.url, sender.tab?.id)
        .then(result => {
          console.log('📤 Sending response back to content script:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('💥 Error in message handler:', error);
          sendResponse({ success: false, error: error.message });
        });

      // Return true to indicate we will send a response asynchronously
      return true;
    }

    if (message.type === 'TRACKING_TOGGLED') {
      console.log(
        `🔄 URL tracking ${message.enabled ? 'enabled' : 'disabled'} from popup`
      );

      // Update badge to reflect tracking status
      if (message.enabled) {
        browser.action?.setBadgeText({ text: '✓' });
        browser.action?.setBadgeBackgroundColor({ color: '#4CAF50' });
      } else {
        browser.action?.setBadgeText({ text: '⏸' });
        browser.action?.setBadgeBackgroundColor({ color: '#FF9800' });
      }

      sendResponse({ success: true });
      return true;
    }
  }
}
