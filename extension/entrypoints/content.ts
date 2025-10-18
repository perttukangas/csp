// Helper function to wait for SPA content to load
const waitForContentToLoad = async (maxWaitTime = 5000, pollInterval = 100) => {
  const startTime = Date.now();
  let lastBodyLength = document.body.innerHTML.length;
  let stableCount = 0;
  const requiredStableCount = 3; // Content must be stable for 3 checks

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const currentBodyLength = document.body.innerHTML.length;

    // Check if content has stabilized
    if (currentBodyLength === lastBodyLength) {
      stableCount++;
      if (stableCount >= requiredStableCount) {
        console.log(
          '📄 Content appears to be stable after',
          Date.now() - startTime,
          'ms'
        );
        break;
      }
    } else {
      stableCount = 0; // Reset if content is still changing
    }

    lastBodyLength = currentBodyLength;
  }

  // Additional wait for any lazy-loaded content
  await new Promise(resolve => setTimeout(resolve, 500));
};

// Helper function to get fully rendered HTML with various fallbacks
const getRenderedHTML = () => {
  // Method 1: Try to get the full rendered HTML
  const fullHTML = document.documentElement.outerHTML;

  // Method 2: For better SPA support, also capture the body content
  const bodyHTML = document.body.innerHTML;

  // Method 3: Try to capture text content as fallback
  const textContent =
    document.body.innerText || document.body.textContent || '';

  // Check if we got meaningful content (not just scripts and basic HTML structure)
  const hasSubstantialContent =
    bodyHTML.length > 1000 ||
    textContent.length > 500 ||
    document.querySelectorAll('div, span, p, article, section').length > 10;

  if (hasSubstantialContent) {
    console.log('📄 Found substantial rendered content');
    return fullHTML;
  } else {
    console.warn('⚠️ Content appears to be minimal, might still be loading');
    return fullHTML; // Return anyway, but with warning
  }
};

// Helper function to wait for specific elements that indicate content is loaded
const waitForKeyElements = async (
  selectors = ['main', '[role="main"]', '.content', '#content', 'article'],
  timeout = 3000
) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.innerHTML.trim().length > 100) {
        console.log('📄 Found key content element:', selector);
        return true;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.warn('⚠️ No key content elements found within timeout');
  return false;
};

// Advanced helper to detect when SPA frameworks have finished rendering
const waitForSPAFrameworks = async (timeout = 5000) => {
  const startTime = Date.now();

  // Check for common SPA framework indicators
  const checkFrameworkReady = () => {
    // React: Check for React DevTools or React Fiber
    const reactRoot = document.querySelector('div[id="root"]');
    if (
      (window as any).React ||
      document.querySelector('[data-reactroot]') ||
      (reactRoot && reactRoot.innerHTML.length > 1000)
    ) {
      return 'react';
    }

    // Vue: Check for Vue instance
    const vueApp = document.querySelector('div[id="app"]');
    if (
      (window as any).Vue ||
      document.querySelector('[data-server-rendered]') ||
      (vueApp && vueApp.innerHTML.length > 1000)
    ) {
      return 'vue';
    }

    // Angular: Check for Angular indicators
    const angularRoot = document.querySelector('app-root');
    if (
      (window as any).ng ||
      document.querySelector('[ng-app]') ||
      (angularRoot && angularRoot.innerHTML.length > 1000)
    ) {
      return 'angular';
    }

    // Check for general SPA indicators (lots of dynamic content)
    const dynamicElements = document.querySelectorAll(
      'div, span, section, article, main'
    );
    if (dynamicElements.length > 50) {
      return 'spa';
    }

    return null;
  };

  while (Date.now() - startTime < timeout) {
    const framework = checkFrameworkReady();
    if (framework) {
      console.log('📄 Detected SPA framework:', framework);
      // Give it a bit more time to finish rendering
      await new Promise(resolve => setTimeout(resolve, 500));
      return framework;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(
    '📄 No specific SPA framework detected, proceeding with generic approach'
  );
  return null;
};

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
            const framework = await waitForSPAFrameworks();

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
