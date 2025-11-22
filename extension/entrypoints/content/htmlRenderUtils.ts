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

// Helper function to clean HTML for storage and scraping
const cleanHTMLForScraping = (html: string): string => {
  // Create a temporary DOM element to work with
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Remove script tags completely
  const scripts = tempDiv.querySelectorAll('script');
  scripts.forEach(script => script.remove());

  // Remove style tags (CSS)
  const styles = tempDiv.querySelectorAll('style');
  styles.forEach(style => style.remove());

  // Remove noscript tags
  const noscripts = tempDiv.querySelectorAll('noscript');
  noscripts.forEach(noscript => noscript.remove());

  // Remove other non-content tags
  const tagsToRemove = [
    'link',
    'meta',
    'base',
    'head',
    'iframe',
    'svg',
    'canvas',
    'video',
    'audio',
    'input',
    'img',
  ];
  tagsToRemove.forEach(tag => {
    const elements = tempDiv.querySelectorAll(tag);
    elements.forEach(element => element.remove());
  });

  // Remove comments
  const walker = document.createTreeWalker(
    tempDiv,
    NodeFilter.SHOW_COMMENT,
    null
  );
  const comments: Node[] = [];
  let node;
  while ((node = walker.nextNode())) {
    comments.push(node);
  }
  comments.forEach(comment => {
    if (comment.parentNode) {
      comment.parentNode.removeChild(comment);
    }
  });

  // Remove unnecessary attributes that take up space
  const allElements = tempDiv.querySelectorAll('*');
  allElements.forEach(element => {
    // Keep only essential attributes for scraping
    const attributesToKeep = [
      'id',
      'class',
      'href',
      'src',
      'alt',
      'title',
      'role',
      'aria-label',
      'data-testid',
      'name',
      'value',
      'type',
      'placeholder',
      'aria-labelledby',
    ];

    const attributesToRemove: string[] = [];
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (!attributesToKeep.includes(attr.name)) {
        attributesToRemove.push(attr.name);
      }
    }

    attributesToRemove.forEach(attrName => {
      element.removeAttribute(attrName);
    });

    // Shorten long class names by keeping only meaningful parts
    const classAttr = element.getAttribute('class');
    if (classAttr && classAttr.length > 100) {
      // Keep only classes that look meaningful (avoid auto-generated ones)
      const meaningfulClasses = classAttr
        .split(' ')
        .filter(
          cls =>
            cls.length < 30 &&
            !cls.match(/^[a-f0-9]{8,}$/i) &&
            !cls.startsWith('css-')
        )
        .slice(0, 5); // Limit to 5 classes max

      if (meaningfulClasses.length > 0) {
        element.setAttribute('class', meaningfulClasses.join(' '));
      } else {
        element.removeAttribute('class');
      }
    }

    // Remove empty attributes
    if (element.getAttribute('class') === '') {
      element.removeAttribute('class');
    }
    if (element.getAttribute('id') === '') {
      element.removeAttribute('id');
    }
  });

  // Remove empty elements that don't contribute to content
  const emptyElements = tempDiv.querySelectorAll(
    'div:empty, span:empty, p:empty, section:empty, article:empty'
  );
  emptyElements.forEach(element => {
    // Only remove if it has no meaningful attributes
    if (
      !element.id &&
      !element.className &&
      !element.getAttribute('data-testid') &&
      !element.getAttribute('role')
    ) {
      element.remove();
    }
  });

  // Remove redundant nested divs with no content
  const redundantDivs = tempDiv.querySelectorAll('div');
  redundantDivs.forEach(div => {
    const children = Array.from(div.children);
    const textContent = div.textContent?.trim() || '';

    // If div only has one child div and no meaningful text content, merge them
    if (
      children.length === 1 &&
      children[0].tagName === 'DIV' &&
      textContent.length < 10
    ) {
      const child = children[0] as Element;
      // Move child's content to parent
      div.innerHTML = child.innerHTML;

      // Merge classes if both have them
      const parentClass = div.getAttribute('class') || '';
      const childClass = child.getAttribute('class') || '';
      if (childClass && !parentClass.includes(childClass)) {
        div.setAttribute('class', `${parentClass} ${childClass}`.trim());
      }
    }
  });

  // Get the cleaned HTML
  let cleanedHTML = tempDiv.innerHTML;

  // Additional text-based cleaning
  cleanedHTML = cleanedHTML
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove newlines and tabs
    .replace(/[\n\r\t]/g, ' ')
    // Remove spaces between tags
    .replace(/>\s+</g, '><')
    // Remove leading/trailing whitespace
    .trim();

  return cleanedHTML;
};

// Helper function to get fully rendered HTML optimized for storage and scraping
export const getRenderedHTML = () => {
  console.log('📄 Starting HTML capture and cleaning...');

  // Get the full rendered HTML
  const fullHTML = document.documentElement.outerHTML;
  const originalSize = fullHTML.length;

  // Clean the HTML to reduce size
  const cleanedHTML = cleanHTMLForScraping(fullHTML);
  const cleanedSize = cleanedHTML.length;

  // Calculate compression ratio
  const compressionRatio = (
    ((originalSize - cleanedSize) / originalSize) *
    100
  ).toFixed(1);

  console.log(
    `📄 HTML cleaned: ${originalSize} → ${cleanedSize} bytes (${compressionRatio}% reduction)`
  );

  // Check if we got meaningful content
  const bodyHTML = document.body.innerHTML;
  const textContent =
    document.body.innerText || document.body.textContent || '';

  const hasSubstantialContent =
    bodyHTML.length > 1000 ||
    textContent.length > 500 ||
    document.querySelectorAll('div, span, p, article, section').length > 10;

  if (hasSubstantialContent) {
    console.log('📄 Found substantial rendered content');
  } else {
    console.warn('⚠️ Content appears to be minimal, might still be loading');
  }

  // Chrome local storage has much higher limits (~10MB), but let's still be reasonable
  const maxSize = 50000; // 50KB should be plenty for scraping while being reasonable
  if (cleanedHTML.length > maxSize) {
    console.warn(
      `⚠️ HTML still too large (${cleanedHTML.length} bytes), truncating to ${maxSize} bytes`
    );

    // Try to truncate at a reasonable point (end of a tag)
    let truncatePoint = maxSize;
    const lastCloseTag = cleanedHTML.lastIndexOf('>', maxSize);
    if (lastCloseTag > maxSize - 200) {
      // If close to our target, use it
      truncatePoint = lastCloseTag + 1;
    }

    const truncatedHTML =
      cleanedHTML.substring(0, truncatePoint) +
      '<!-- [TRUNCATED FOR STORAGE] -->';
    console.log(`📄 HTML truncated at position ${truncatePoint}`);
    return truncatedHTML;
  }

  return cleanedHTML;
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
