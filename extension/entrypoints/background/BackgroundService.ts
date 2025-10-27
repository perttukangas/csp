import { extensionStorage } from '../../utils/storage';
import { browser } from 'wxt/browser';

interface ScrapeResponse {
  url: string;
  validationStatus?: 'pending' | 'validated' | 'invalid';
}

export class BackgroundService {
  async getPropmpt() {
    try {
      const prompt = await extensionStorage.get('prompt', '');
      return prompt || '';
    } catch (error) {
      console.error('Failed to get prompt:', error);
      return '';
    }
  }

  async getStoredResponses(): Promise<ScrapeResponse[]> {
    try {
      const responses = await extensionStorage.get('storedResponses', []);
      return responses || [];
    } catch (error) {
      console.error('Failed to get stored responses:', error);
      return [];
    }
  }

  async storeResponse(response: ScrapeResponse): Promise<void> {
    try {
      const existingResponses = await this.getStoredResponses();
      const updatedResponses = [...existingResponses, response];
      await extensionStorage.set('storedResponses', updatedResponses);
      console.log('📦 Response stored successfully:', response.url);
    } catch (error) {
      console.error('Failed to store response:', error);
    }
  }

  async updateValidationStatus(
    responseUrl: string,
    validationStatus: 'validated' | 'invalid'
  ): Promise<boolean> {
    try {
      const existingResponses = await this.getStoredResponses();
      const updatedResponses = existingResponses.map(response =>
        response.url === responseUrl
          ? { ...response, validationStatus }
          : response
      );
      await extensionStorage.set('storedResponses', updatedResponses);
      console.log(
        '✅ Validation status updated successfully:',
        responseUrl,
        validationStatus
      );
      return true;
    } catch (error) {
      console.error('Failed to update validation status:', error);
      return false;
    }
  }

  async removeResponse(responseUrl: string): Promise<boolean> {
    try {
      const existingResponses = await this.getStoredResponses();
      const updatedResponses = existingResponses.filter(
        response => response.url !== responseUrl
      );
      await extensionStorage.set('storedResponses', updatedResponses);
      console.log('🗑️ Response removed successfully:', responseUrl);
      return true;
    } catch (error) {
      console.error('Failed to remove response:', error);
      return false;
    }
  }

  async removeAllResponses(): Promise<boolean> {
    try {
      await extensionStorage.set('storedResponses', []);
      console.log('🗑️ All responses removed successfully');
      return true;
    } catch (error) {
      console.error('Failed to remove all responses:', error);
      return false;
    }
  }

  async validateAllPendingResponses(): Promise<boolean> {
    try {
      const existingResponses = await this.getStoredResponses();
      const updatedResponses = existingResponses.map(response =>
        response.validationStatus === 'pending'
          ? { ...response, validationStatus: 'validated' as const }
          : response
      );
      await extensionStorage.set('storedResponses', updatedResponses);
      console.log('✅ All pending responses validated successfully');
      return true;
    } catch (error) {
      console.error('Failed to validate all pending responses:', error);
      return false;
    }
  }

  async isTrackingEnabled(): Promise<boolean> {
    try {
      const enabled = await extensionStorage.get('urlTrackingEnabled', false);
      return enabled || false;
    } catch (error) {
      console.error('Failed to check tracking status:', error);
      return false;
    }
  }

  async storeUrlForLater(url: string, tabId?: number) {
    const trackingEnabled = await this.isTrackingEnabled();
    if (!trackingEnabled) {
      console.log('🚫 URL tracking disabled, skipping:', url);
      return { success: false, error: 'URL tracking is disabled' };
    }

    console.log('📦 Storing URL for later batch sending:', url);
    try {
      // Check if URL already exists
      const existingResponses = await this.getStoredResponses();
      const urlExists = existingResponses.some(r => r.url === url);

      if (urlExists) {
        console.log('⚠️ URL already stored, skipping:', url);
        return { success: true };
      }

      // Create a response entry for the URL without sending to server
      const scrapeResponse: ScrapeResponse = {
        url,
        validationStatus: 'pending',
      };

      await this.storeResponse(scrapeResponse);
      return { success: true };
    } catch (error) {
      console.error('💥 Failed to store URL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async sendValidatedResponsesToServer(): Promise<{
    success: boolean;
    error?: string;
    sent?: number;
  }> {
    console.log('🚀 Starting sendValidatedResponsesToServer()');
    try {
      const responses = await this.getStoredResponses();
      console.log('📦 Total stored responses:', responses.length);

      const validatedResponses = responses.filter(
        r => r.validationStatus === 'validated'
      );
      console.log('✅ Validated responses found:', validatedResponses.length);

      if (validatedResponses.length === 0) {
        console.log('⚠️ No validated responses to send');
        return { success: false, error: 'No validated responses to send' };
      }

      console.log(
        `📤 Sending ${validatedResponses.length} validated responses to server`
      );

      // Get the current prompt
      const currentPrompt = await this.getPropmpt();
      console.log('📝 Current prompt:', currentPrompt);

      // Send all validated responses to the server
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      console.log(`🌐 Making HTTP request to ${backendUrl}/api/process`);
      const response = await fetch(`${backendUrl}/api/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: validatedResponses.map(r => ({
            url: r.url,
          })),
          prompt: currentPrompt || '',
        }),
      });

      console.log(
        '📡 HTTP response received. Status:',
        response.status,
        'OK:',
        response.ok
      );

      if (response.ok) {
        const responseText = await response.text();
        console.log(
          '✅ Validated responses sent to server successfully. Response:',
          responseText
        );
        return { success: true, sent: validatedResponses.length };
      } else {
        console.error('❌ Server returned error:', response.status);
        return { success: false, error: `Server error: ${response.status}` };
      }
    } catch (error) {
      console.error('💥 Failed to send validated responses to server:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verifySampleResponses(): Promise<{
    success: boolean;
    error?: string;
    csvContent?: string;
  }> {
    console.log('🔍 Starting verifySampleResponses()');
    try {
      const responses = await this.getStoredResponses();
      console.log('📦 Total stored responses:', responses.length);

      const validatedResponses = responses.filter(
        r => r.validationStatus === 'validated'
      );
      console.log('✅ Validated responses found:', validatedResponses.length);

      if (validatedResponses.length === 0) {
        console.log('⚠️ No validated responses to verify');
        return { success: false, error: 'No validated responses to verify' };
      }

      // Take first 3 URLs for verification
      const verificationUrls = validatedResponses.slice(0, 3);
      console.log(`🔍 Verifying first ${verificationUrls.length} URLs`);

      // Get the current prompt
      const currentPrompt = await this.getPropmpt();
      console.log('📝 Current prompt:', currentPrompt);

      // Send verification request to the server
      const backendUrl = 'http://localhost:8000';
      console.log(`🌐 Making verification HTTP request to ${backendUrl}/api/verify`);
      const response = await fetch(`${backendUrl}/api/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: verificationUrls.map(r => ({
            url: r.url,
          })),
          prompt: currentPrompt || '',
        }),
      });

      console.log(
        '📡 Verification HTTP response received. Status:',
        response.status,
        'OK:',
        response.ok
      );

      if (response.ok) {
        const csvContent = await response.text();
        console.log(
          '✅ Verification completed successfully. CSV length:',
          csvContent.length
        );
        return { success: true, csvContent };
      } else {
        console.error('❌ Verification server returned error:', response.status);
        return { success: false, error: `Server error: ${response.status}` };
      }
    } catch (error) {
      console.error('💥 Failed to verify sample responses:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  handleMessage(
    message: any,
    sender: any,
    sendResponse: (response: any) => void
  ) {
    console.log(
      '🎯 BackgroundService.handleMessage called with:',
      message.type,
      message
    );
    console.log(
      '📍 Message details - Type:',
      message.type,
      'Sender:',
      sender.tab?.id,
      'Full message:',
      JSON.stringify(message)
    );

    if (message.type === 'URL_CHANGED') {
      console.log('📨 Received URL change from content script:', message.url);

      this.storeUrlForLater(message.url, sender.tab?.id)
        .then(result => {
          console.log('📤 Sending response back to content script:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('💥 Error in message handler:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (message.type === 'TRACKING_TOGGLED') {
      console.log(
        `🔄 URL tracking ${message.enabled ? 'enabled' : 'disabled'} from popup`
      );

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
          console.log(
            '📤 Sending stored responses back to popup:',
            responses.length
          );
          sendResponse({ success: true, responses });
        })
        .catch(error => {
          console.error('💥 Error getting stored responses:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (message.type === 'SEND_VALIDATED') {
      console.log('📨 Received request to send validated responses');
      console.log('🔍 About to call sendValidatedResponsesToServer()');

      this.sendValidatedResponsesToServer()
        .then(result => {
          console.log('📤 Send validated responses result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('💥 Error sending validated responses:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (message.type === 'VERIFY_SAMPLE') {
      console.log('📨 Received request to verify sample responses');
      console.log('🔍 About to call verifySampleResponses()');

      this.verifySampleResponses()
        .then(result => {
          console.log('📤 Verify sample responses result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('💥 Error verifying sample responses:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (message.type === 'UPDATE_VALIDATION') {
      console.log(
        '📨 Received request to update validation:',
        message.responseUrl,
        message.validationStatus
      );

      this.updateValidationStatus(message.responseUrl, message.validationStatus)
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

    if (message.type === 'REMOVE_RESPONSE') {
      console.log(
        '📨 Received request to remove response:',
        message.responseUrl
      );

      this.removeResponse(message.responseUrl)
        .then(success => {
          console.log('📤 Remove response result:', success);
          sendResponse({ success });
        })
        .catch(error => {
          console.error('💥 Error removing response:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (message.type === 'REMOVE_ALL_RESPONSES') {
      console.log('📨 Received request to remove all responses');

      this.removeAllResponses()
        .then(success => {
          console.log('📤 Remove all responses result:', success);
          sendResponse({ success });
        })
        .catch(error => {
          console.error('💥 Error removing all responses:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (message.type === 'VALIDATE_ALL_PENDING') {
      console.log('📨 Received request to validate all pending responses');

      this.validateAllPendingResponses()
        .then(success => {
          console.log('📤 Validate all pending responses result:', success);
          sendResponse({ success });
        })
        .catch(error => {
          console.error('💥 Error validating all pending responses:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }
  }
}
