import { extensionStorage } from '../../utils/storage';

export interface ScrapeResponse {
  url: string;
  type: 'url' | 'html';
  validationStatus?: 'pending' | 'validated' | 'invalid';
  html?: string;
}

export class BackgroundService {
  async getPropmpt() {
    try {
      const prompt = await extensionStorage.get('prompt', '');
      return prompt;
    } catch (error) {
      console.error('Failed to get prompt:', error);
      return '';
    }
  }

  async checkIfUrlRequiresAuthentication(url: string): Promise<boolean> {
    try {
      console.log('🔍 Checking if URL requires authentication:', url);

      // Make request WITHOUT any credentials, cookies, or auth headers
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'omit', // This ensures NO cookies or auth headers are sent
        cache: 'no-cache', // Don't use cached responses
        headers: {
          // Explicitly set minimal headers to avoid any auth-related headers
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'manual', // Don't follow redirects automatically
      });

      console.log('📊 Response status:', response.status);
      console.log('📊 Response type:', response.type);
      console.log('📊 Response redirected:', response.redirected);

      // Check for authentication requirements
      if (response.status === 401) {
        console.log('🔒 URL requires authentication (401 Unauthorized):', url);
        return true;
      }

      if (response.status === 403) {
        console.log('🔒 URL requires authentication (403 Forbidden):', url);
        return true;
      }

      // Check for redirects to login pages (when redirect is manual)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (
          location &&
          (location.includes('login') ||
            location.includes('auth') ||
            location.includes('signin'))
        ) {
          console.log(
            '🔒 URL redirects to authentication page:',
            url,
            '→',
            location
          );
          return true;
        }
      }

      // Check for WWW-Authenticate header
      if (response.headers.get('www-authenticate')) {
        console.log(
          '🔒 URL requires authentication (WWW-Authenticate header present):',
          url
        );
        return true;
      }

      if (response.ok) {
        console.log('✅ URL is accessible without authentication:', url);
        return false;
      }

      // If we get here, it's some other error (not necessarily auth-related)
      // Assume that it requires auth. For example, Github returns 404 for private repos.
      console.log(
        '⚠️ URL returned non-OK status but not clearly auth-related:',
        response.status
      );
      return true;
    } catch (error) {
      console.error('Failed to check URL authentication:', error);
      // Network errors could indicate auth issues, but could also be network problems
      return false;
    }
  }

  async getStoredResponses(): Promise<ScrapeResponse[]> {
    try {
      // Get URL-only responses from extensionStorage (sync)
      const urlResponses = await extensionStorage.get('storedResponses', []);

      // Get HTML responses from local storage (has higher limits)
      const localResult = await browser.storage.local.get(['htmlResponses']);
      const htmlResponses = localResult.htmlResponses || [];

      // Merge both arrays
      const responses = [...urlResponses, ...htmlResponses];
      return responses;
    } catch (error) {
      console.error('Failed to get stored responses:', error);
      return [];
    }
  }

  async storeResponse(response: ScrapeResponse): Promise<void> {
    try {
      if (response.type === 'html' && response.html) {
        // Store HTML responses in local storage (has much higher limits)
        const existingHtmlResponses = await this.getStoredHtmlResponses();
        const updatedHtmlResponses = [...existingHtmlResponses, response];
        await browser.storage.local.set({
          htmlResponses: updatedHtmlResponses,
        });
        console.log(
          '📦 HTML response stored successfully in local storage:',
          response.url
        );
      } else {
        // Store URL-only responses using extensionStorage (sync)
        const existingResponses = await extensionStorage.get(
          'storedResponses',
          []
        );
        const updatedResponses = [...existingResponses, response];
        await extensionStorage.set('storedResponses', updatedResponses);
        console.log(
          '📦 URL response stored successfully in sync storage:',
          response.url
        );
      }
    } catch (error) {
      console.error('Failed to store response:', error);
      throw error;
    }
  }

  private async getStoredUrlResponses(): Promise<ScrapeResponse[]> {
    try {
      const responses = await extensionStorage.get('storedResponses', []);
      return responses;
    } catch (error) {
      console.error('Failed to get stored URL responses:', error);
      return [];
    }
  }

  private async getStoredHtmlResponses(): Promise<ScrapeResponse[]> {
    try {
      const result = await browser.storage.local.get(['htmlResponses']);
      return result.htmlResponses || [];
    } catch (error) {
      console.error('Failed to get stored HTML responses:', error);
      return [];
    }
  }

  async getStorageInfo(): Promise<{
    bytesInUse: number;
    quotaBytes: number;
    percentageUsed: number;
    isLocal: boolean;
    breakdown: Array<{
      key: string;
      size: number;
      percentage: number;
      storageType: 'sync' | 'local';
    }>;
    syncUsage: number;
    localUsage: number;
    totalResponses: number;
  }> {
    try {
      console.log('📊 Getting comprehensive storage info...');

      // Get data from both storage types
      const syncData = await browser.storage.sync.get();
      const localData = await browser.storage.local.get();

      console.log('📦 Sync storage data:', syncData);
      console.log('📦 Local storage data:', localData);

      // Calculate bytes in use for both storage types
      let syncUsage = 0;
      let localUsage = 0;

      try {
        syncUsage = await browser.storage.sync.getBytesInUse();
        localUsage = await browser.storage.local.getBytesInUse();
      } catch (error) {
        console.warn('getBytesInUse() not supported, calculating manually');
        syncUsage = new Blob([JSON.stringify(syncData)]).size;
        localUsage = new Blob([JSON.stringify(localData)]).size;
      }

      const totalBytesUsed = syncUsage + localUsage;

      // Storage limits (Chrome limits)
      const syncQuota = 102400; // 100KB
      const localQuota = 5242880; // 5MB

      // Use local storage quota if we have local data, otherwise sync
      const primaryQuota = localUsage > 0 ? localQuota : syncQuota;
      const isLocal = localUsage > syncUsage;

      // Calculate percentage based on the primary storage type being used
      const percentageUsed = (totalBytesUsed / primaryQuota) * 100;

      console.log('📊 Storage calculations:', {
        syncUsage,
        localUsage,
        totalBytesUsed,
        syncQuota,
        localQuota,
        primaryQuota,
        isLocal,
        percentageUsed,
      });

      // Create detailed breakdown
      const breakdown: Array<{
        key: string;
        size: number;
        percentage: number;
        storageType: 'sync' | 'local';
      }> = [];

      // Add sync storage items
      for (const [key, value] of Object.entries(syncData)) {
        try {
          const size = new Blob([JSON.stringify(value)]).size;
          const percentage =
            totalBytesUsed > 0 ? (size / totalBytesUsed) * 100 : 0;
          breakdown.push({
            key,
            size,
            percentage,
            storageType: 'sync',
          });
        } catch (error) {
          console.warn(
            `Failed to calculate size for sync key "${key}":`,
            error
          );
        }
      }

      // Add local storage items
      for (const [key, value] of Object.entries(localData)) {
        try {
          const size = new Blob([JSON.stringify(value)]).size;
          const percentage =
            totalBytesUsed > 0 ? (size / totalBytesUsed) * 100 : 0;
          breakdown.push({
            key: `${key} (local)`,
            size,
            percentage,
            storageType: 'local',
          });
        } catch (error) {
          console.warn(
            `Failed to calculate size for local key "${key}":`,
            error
          );
        }
      }

      // Sort by size (largest first)
      breakdown.sort((a, b) => b.size - a.size);

      const responses = await this.getStoredResponses();

      console.log('📊 Storage info calculated:', {
        bytesInUse: totalBytesUsed,
        quotaBytes: primaryQuota,
        percentageUsed,
        syncUsage,
        localUsage,
        totalResponses: responses.length,
        breakdown: breakdown.length,
      });

      return {
        bytesInUse: totalBytesUsed,
        quotaBytes: primaryQuota,
        percentageUsed: Math.min(percentageUsed, 100),
        isLocal,
        breakdown,
        syncUsage,
        localUsage,
        totalResponses: responses.length,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return {
        bytesInUse: 0,
        quotaBytes: 0,
        percentageUsed: 0,
        isLocal: true,
        breakdown: [],
        syncUsage: 0,
        localUsage: 0,
        totalResponses: 0,
      };
    }
  }

  async updateValidationStatus(
    responseUrl: string,
    validationStatus: 'validated' | 'invalid'
  ): Promise<boolean> {
    try {
      // Update in both storage types
      let updated = false;

      // Update URL responses in sync storage
      const urlResponses = await this.getStoredUrlResponses();
      const updatedUrlResponses = urlResponses.map(response =>
        response.url === responseUrl
          ? { ...response, validationStatus }
          : response
      );

      if (
        JSON.stringify(urlResponses) !== JSON.stringify(updatedUrlResponses)
      ) {
        await extensionStorage.set('storedResponses', updatedUrlResponses);
        updated = true;
      }

      // Update HTML responses in local storage
      const htmlResponses = await this.getStoredHtmlResponses();
      const updatedHtmlResponses = htmlResponses.map(response =>
        response.url === responseUrl
          ? { ...response, validationStatus }
          : response
      );

      if (
        JSON.stringify(htmlResponses) !== JSON.stringify(updatedHtmlResponses)
      ) {
        await browser.storage.local.set({
          htmlResponses: updatedHtmlResponses,
        });
        updated = true;
      }

      if (updated) {
        console.log(
          '✅ Validation status updated successfully:',
          responseUrl,
          validationStatus
        );
      }

      return updated;
    } catch (error) {
      console.error('Failed to update validation status:', error);
      return false;
    }
  }

  async removeResponse(responseUrl: string): Promise<boolean> {
    try {
      let removed = false;

      // Remove from URL responses in sync storage
      const urlResponses = await this.getStoredUrlResponses();
      const updatedUrlResponses = urlResponses.filter(
        response => response.url !== responseUrl
      );

      if (urlResponses.length !== updatedUrlResponses.length) {
        await extensionStorage.set('storedResponses', updatedUrlResponses);
        removed = true;
      }

      // Remove from HTML responses in local storage
      const htmlResponses = await this.getStoredHtmlResponses();
      const updatedHtmlResponses = htmlResponses.filter(
        response => response.url !== responseUrl
      );

      if (htmlResponses.length !== updatedHtmlResponses.length) {
        await browser.storage.local.set({
          htmlResponses: updatedHtmlResponses,
        });
        removed = true;
      }

      if (removed) {
        console.log('🗑️ Response removed successfully:', responseUrl);
      }

      return removed;
    } catch (error) {
      console.error('Failed to remove response:', error);
      return false;
    }
  }

  async removeAllResponses(): Promise<boolean> {
    try {
      // Clear both storage types
      await extensionStorage.set('storedResponses', []);
      await browser.storage.local.set({ htmlResponses: [] });
      console.log('🗑️ All responses removed successfully from both storages');
      return true;
    } catch (error) {
      console.error('Failed to remove all responses:', error);
      return false;
    }
  }

  async validateAllPendingResponses(): Promise<boolean> {
    try {
      // Update URL responses in sync storage
      const urlResponses = await this.getStoredUrlResponses();
      const updatedUrlResponses = urlResponses.map(response =>
        response.validationStatus === 'pending'
          ? { ...response, validationStatus: 'validated' as const }
          : response
      );
      await extensionStorage.set('storedResponses', updatedUrlResponses);

      // Update HTML responses in local storage
      const htmlResponses = await this.getStoredHtmlResponses();
      const updatedHtmlResponses = htmlResponses.map(response =>
        response.validationStatus === 'pending'
          ? { ...response, validationStatus: 'validated' as const }
          : response
      );
      await browser.storage.local.set({ htmlResponses: updatedHtmlResponses });

      console.log(
        '✅ All pending responses validated successfully in both storages'
      );
      return true;
    } catch (error) {
      console.error('Failed to validate all pending responses:', error);
      return false;
    }
  }

  async isTrackingEnabled(): Promise<boolean> {
    try {
      const enabled = await extensionStorage.get('urlTrackingEnabled', false);
      return enabled;
    } catch (error) {
      console.error('Failed to check tracking status:', error);
      return false;
    }
  }

  async storeUrlForLater(url: string, html?: string, tabId?: number) {
    const trackingEnabled = await this.isTrackingEnabled();
    if (!trackingEnabled) {
      console.log('🚫 URL tracking disabled, skipping:', url);
      return { success: false, error: 'URL tracking is disabled' };
    }

    const urlRequiresAuth =
      !html && (await this.checkIfUrlRequiresAuthentication(url));
    if (urlRequiresAuth) {
      console.log('🚫 URL requires authentication, skipping:', url);
      return {
        success: false,
        requiresAuth: true,
        error: 'URL requires authentication',
      };
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

      console.log('What is the type? ', url, html);

      // Create a response entry for the URL without sending to server
      const scrapeResponse: ScrapeResponse = {
        url,
        type: html ? 'html' : 'url',
        validationStatus: 'pending',
        html,
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
    csvData?: string;
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
      const isCrawlingMode = await extensionStorage.get('crawlingMode', false);
      const isAnalysisMode = await extensionStorage.get('analysisMode', false);

      console.log('📝 Current prompt:', currentPrompt);
      console.log('🕷️ Crawling mode:', isCrawlingMode);
      console.log('🔍 Analysis mode:', isAnalysisMode);

      const validatedUrls = validatedResponses.filter(r => r.type === 'url');
      const validatedHtmls = validatedResponses.filter(r => r.type === 'html');

      console.log(
        `🌐 Preparing to send ${validatedUrls.length} URLs and ${validatedHtmls.length} HTML contents to server`
      );

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
          urls: validatedUrls.map(r => ({
            url: r.url,
          })),
          htmls: validatedHtmls.map(r => ({
            html: r.html,
          })),
          prompt: currentPrompt,
          crawl: isCrawlingMode,
          analysis_only: isAnalysisMode,
        }),
      });

      console.log(
        '📡 HTTP response received. Status:',
        response.status,
        'OK:',
        response.ok
      );

      if (response.ok) {
        // Get the CSV content as text
        const csvData = await response.text();
        console.log('📥 CSV data received, length:', csvData.length);

        console.log('✅ CSV data ready for download');
        return { success: true, sent: validatedResponses.length, csvData };
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
    sent?: number;
    csvData?: string;
  }> {
    console.log('🚀 Starting sendValidatedResponsesToServer()');
    try {
      const responses = await this.getStoredResponses();
      console.log('📦 Total stored responses:', responses.length);

      const validatedResponses = responses
        .filter(r => r.validationStatus === 'validated')
        .slice(0, 3);

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
      const isCrawlingMode = await extensionStorage.get('crawlingMode', false);
      const isAnalysisMode = await extensionStorage.get('analysisMode', false);

      console.log('📝 Current prompt:', currentPrompt);
      console.log('🕷️ Crawling mode:', isCrawlingMode);
      console.log('🔍 Analysis mode:', isAnalysisMode);

      const validatedUrls = validatedResponses.filter(r => r.type === 'url');
      const validatedHtmls = validatedResponses.filter(r => r.type === 'html');

      console.log(
        `🌐 Preparing to send ${validatedUrls.length} URLs and ${validatedHtmls.length} HTML contents to server`
      );

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
          urls: validatedUrls.map(r => ({
            url: r.url,
          })),
          htmls: validatedHtmls.map(r => ({
            html: r.html,
          })),
          prompt: currentPrompt,
          crawl: isCrawlingMode,
          analysis_only: isAnalysisMode,
        }),
      });

      console.log(
        '📡 HTTP response received. Status:',
        response.status,
        'OK:',
        response.ok
      );

      if (response.ok) {
        // Get the CSV content as text
        const csvData = await response.text();
        console.log('📥 CSV data received, length:', csvData.length);

        console.log('✅ CSV data ready for download');
        return { success: true, sent: validatedResponses.length, csvData };
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

  handleMessage(
    message: any,
    sender: globalThis.Browser.runtime.MessageSender,
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

      console.log('Pre storing URL for later...');

      this.storeUrlForLater(message.url, undefined, sender.tab?.id)
        .then(result => {
          console.log(
            '📤 Sending response back to content script:',
            result,
            result.requiresAuth
          );
          sendResponse({ ...result, requiresAuth: result.requiresAuth });
        })
        .catch(error => {
          console.error('💥 Error in message handler:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (message.type === 'STORE_HTML_URL') {
      console.log(
        '📨 Received STORE_HTML_URL from content script:',
        message.url,
        message.html
      );
      this.storeUrlForLater(message.url, message.html, sender.tab?.id)
        .then(result => {
          console.log('📤 Sending response back to content script:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('💥 Error in STORE_HTML_URL handler:', error);
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

    if (message.type === 'CRAWLING_TOGGLED') {
      //this is the minimum change to add some message. I dont know what else to add here

      console.log(
        `🕷️ Crawling mode ${message.enabled ? 'enabled' : 'disabled'} from popup`
      );
      return true;
    }

    if (message.type === 'ANALYSIS_TOGGLED') {
      console.log(
        `🔍 Analysis mode ${message.enabled ? 'enabled' : 'disabled'} from popup`
      );
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'GET_RESPONSES') {
      console.log('📨 Received request to get stored responses');

      this.getStoredResponses()
        .then(responses => {
          console.log('📦 Loaded stored responses:', responses);
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

    if (message.type === 'GET_STORAGE_USAGE') {
      console.log('📨 Received request to get storage usage');

      this.getStorageInfo()
        .then(storageInfo => {
          console.log('📤 Storage info result:', storageInfo);
          sendResponse({ success: true, storageInfo });
        })
        .catch(error => {
          console.error('💥 Error getting storage info:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true;
    }
  }
}
