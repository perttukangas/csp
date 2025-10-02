export default defineContentScript({
  matches: ['<all_urls>'], // Run on all websites
  main() {
    console.log('Content script loaded on:', window.location.href);

    // Function to handle URL changes
    const handleUrlChange = async (url: string) => {
      console.log('URL changed to:', url);

      // Send message to background script to handle the request
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

    // Method 3: Listen for popstate events (back/forward)
    window.addEventListener('popstate', () => {
      // For popstate, we do need setTimeout because the URL change happens asynchronously
      setTimeout(() => handleUrlChange(window.location.href), 0);
    });
  },
});
