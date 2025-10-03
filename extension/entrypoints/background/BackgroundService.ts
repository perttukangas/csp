interface ScrapeResponse {
  id: string;
  url: string;
  prompt: string;
  response: string;
  timestamp: number;
  status: 'completed' | 'failed';
  validationStatus?: 'pending' | 'validated' | 'invalid';
}

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

  async getStoredResponses(): Promise<ScrapeResponse[]> {
    try {
      const result = await browser.storage.sync.get(['storedResponses']);
      return result.storedResponses || [];
    } catch (error) {
      console.error('Failed to get stored responses:', error);
      return [];
    }
  }

  async storeResponse(response: ScrapeResponse): Promise<void> {
    try {
      const existingResponses = await this.getStoredResponses();
      const updatedResponses = [...existingResponses, response];
      await browser.storage.sync.set({ storedResponses: updatedResponses });
      console.log('📦 Response stored successfully:', response.id);
    } catch (error) {
      console.error('Failed to store response:', error);
    }
  }

  async removeResponse(responseId: string): Promise<boolean> {
    try {
      // First try to delete from server
      const deleteResult = await this.deleteResponseFromServer(responseId);

      // Remove from local storage regardless of server response
      const existingResponses = await this.getStoredResponses();
      const updatedResponses = existingResponses.filter(r => r.id !== responseId);
      await browser.storage.sync.set({ storedResponses: updatedResponses });

      console.log('🗑️ Response removed successfully:', responseId);
      return deleteResult.success;
    } catch (error) {
      console.error('Failed to remove response:', error);
      return false;
    }
  }

  async updateValidationStatus(responseId: string, validationStatus: 'validated' | 'invalid'): Promise<boolean> {
    try {
      const existingResponses = await this.getStoredResponses();
      const updatedResponses = existingResponses.map(response =>
        response.id === responseId
          ? { ...response, validationStatus }
          : response
      );
      await browser.storage.sync.set({ storedResponses: updatedResponses });
      console.log('✅ Validation status updated successfully:', responseId, validationStatus);
      return true;
    } catch (error) {
      console.error('Failed to update validation status:', error);
      return false;
    }
  }

  async deleteResponseFromServer(responseId: string) {
    try {
      const response = await fetch(`http://localhost:8000/api/test/${responseId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        console.log('✅ Response deleted from server successfully:', responseId);
        return { success: true };
      } else {
        console.error('❌ Server returned error:', response.status);
        return { success: false, error: `Server error: ${response.status}` };
      }
    } catch (error) {
      console.error('💥 Failed to delete response from server:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
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

        // Try to parse the response and store it
        const responseData = await response.json();

        // Create a mock response for now (since we don't have actual server response structure)
        const scrapeResponse: ScrapeResponse = {
          id: `response_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          url,
          prompt: propmt,
          response: responseData.response || `Scraped content from: ${url}`,
          timestamp: Date.now(),
          status: 'completed',
          validationStatus: 'pending'
        };

        await this.storeResponse(scrapeResponse);

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
    console.log('🎯 BackgroundService.handleMessage called with:', message.type, message);

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

    if (message.type === 'GET_RESPONSES') {
      console.log('📨 Received request to get stored responses');

      this.getStoredResponses()
        .then(responses => {
          console.log('📤 Sending stored responses back to popup:', responses.length);
          sendResponse({ success: true, responses });
        })
        .catch(error => {
          console.error('💥 Error getting stored responses:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (message.type === 'REMOVE_RESPONSE') {
      console.log('📨 Received request to remove response:', message.responseId);

      this.removeResponse(message.responseId)
        .then(success => {
          console.log('📤 Response removal result:', success);
          sendResponse({ success });
        })
        .catch(error => {
          console.error('💥 Error removing response:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (message.type === 'UPDATE_VALIDATION') {
      console.log('📨 Received request to update validation:', message.responseId, message.validationStatus);

      this.updateValidationStatus(message.responseId, message.validationStatus)
        .then(success => {
          console.log('📤 Validation update result:', success);
          sendResponse({ success });
        })
        .catch(error => {
          console.error('💥 Error updating validation:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }
  }
}
