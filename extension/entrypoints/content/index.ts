import {
  getRenderedHTML,
  waitForContentToLoad,
  waitForKeyElements,
  waitForSPAFrameworks,
} from './htmlRenderUtils';

export default defineContentScript({
  matches: ['<all_urls>'], // Run on all websites
  main() {
    console.log('Content script loaded on:', window.location.href);

    const captureAndSendHTML = async (url: string) => {
      console.log('🔒 Capturing rendered HTML for:', url);

      // Strategy 1: Detect and wait for SPA frameworks
      await waitForSPAFrameworks();

      // Strategy 2: Wait for key content elements to appear
      await waitForKeyElements();

      // Strategy 3: Wait for content to stabilize
      await waitForContentToLoad();

      // Strategy 4: Get the fully rendered HTML
      const html = getRenderedHTML();
      console.log('📄 Captured rendered HTML length:', html.length);

      // Optional: Extract meaningful text content for analysis
      const textContent = document.body.innerText || '';
      const wordCount = textContent
        .split(/\s+/)
        .filter(word => word.length > 0).length;
      console.log('📄 Text content word count:', wordCount);

      const response = await browser.runtime.sendMessage({
        type: 'STORE_HTML_URL',
        url: url,
        html: html,
      });

      console.log(
        'Received response from background script for HTML storage:',
        response
      );

      return response;
    };

    const handleUrlChange = async (url: string) => {
      console.log('URL changed to:', url);

      // Send message to background script to handle the request
      // In content.ts CORS/ Networking errors occur
      try {
        console.log('Sending message to background script:', {
          type: 'URL_CHANGED',
          url: url,
        });

        const response = await browser.runtime.sendMessage({
          type: 'URL_CHANGED',
          url: url,
        });

        console.log('Received response from background script:', response);

        if (response?.success) {
          console.log(
            '✅ URL sent to server successfully via background script'
          );
        } else if (response.requiresAuth || response.forceHtmlCapture) {
          await captureAndSendHTML(url);
        } else {
          console.log(
            '❌ Failed to send URL via background script:',
            response?.error || 'No error details'
          );
        }
      } catch (error) {
        console.error('💥 Failed to send message to background script:', error);
      }
    };

    // Listen for messages from background script
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'CAPTURE_HTML') {
        console.log(
          '📨 Received CAPTURE_HTML message from background:',
          message.url
        );
        captureAndSendHTML(message.url)
          .then(response => {
            sendResponse(response);
          })
          .catch(error => {
            console.error('Failed to capture HTML:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Keep the message channel open for async response
      }
    });

    // Initial URL
    handleUrlChange(window.location.href);

    // Method 1: Listen for history changes (back/forward buttons, pushState)
    let currentUrl = window.location.href;

    const observer = new MutationObserver(() => {
      if (currentUrl !== window.location.href) {
        currentUrl = window.location.href;
        handleUrlChange(currentUrl);
      }
    });

    observer.observe(document, { subtree: true, childList: true });

    // Method 2: Override pushState and replaceState for SPA navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (state, title, url, ...args) {
      originalPushState.apply(history, [state, title, url, ...args]);
      // Use the URL from the parameters instead of window.location.href
      const newUrl = url
        ? new URL(url, window.location.origin).href
        : window.location.href;
      handleUrlChange(newUrl);
    };

    history.replaceState = function (state, title, url, ...args) {
      originalReplaceState.apply(history, [state, title, url, ...args]);
      // Use the URL from the parameters instead of window.location.href
      const newUrl = url
        ? new URL(url, window.location.origin).href
        : window.location.href;
      handleUrlChange(newUrl);
    };

    window.addEventListener('popstate', () => {
      // For popstate, we do need setTimeout because the URL change happens asynchronously
      setTimeout(() => handleUrlChange(window.location.href), 0);
    });
  },
});
