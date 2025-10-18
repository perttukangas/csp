// Helper function to wait for SPA content to load
export const waitForContentToLoad = async (
  maxWaitTime = 5000,
  pollInterval = 100
) => {
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
export const getRenderedHTML = () => {
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
export const waitForKeyElements = async (
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
export const waitForSPAFrameworks = async (timeout = 5000) => {
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
