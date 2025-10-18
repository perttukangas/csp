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
          if (response.requiresAuth) {
            console.log(
              '🔒 Page requires authentication, capturing rendered content...'
            );

            // Strategy 1: Detect and wait for SPA frameworks
            await waitForSPAFrameworks();

            // Strategy 2: Wait for key content elements to appear
            await waitForKeyElements();

            // Strategy 3: Wait for content to stabilize
            await waitForContentToLoad();

            // Strategy 4: Get the fully rendered HTML
            const html = getRenderedHTML();
            console.log('📄 Captured rendered HTML length:', html);

            // Optional: Extract meaningful text content for analysis
            const textContent = document.body.innerText || '';
            const wordCount = textContent
              .split(/\s+/)
              .filter(word => word.length > 0).length;
            console.log('📄 Text content word count:', wordCount);

            // You can now send this HTML to your backend for processing
            // For example, you could send it back to the background script:
            /*
            try {
              await browser.runtime.sendMessage({
                type: 'RENDERED_HTML_CAPTURED',
                url: url,
                html: html,
                textContent: textContent,
                wordCount: wordCount
              });
            } catch (error) {
              console.error('Failed to send rendered HTML to background:', error);
            }
            */
          }
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
