"""HTML rendering service using Playwright for JavaScript-heavy pages."""

from playwright.async_api import async_playwright
from typing import Optional


async def fetch_rendered_html(url: str, wait_for_selector: Optional[str] = None, timeout: int = 60000) -> str:
    """
    Fetch and render a URL with JavaScript execution using Playwright.

    This function launches a headless browser, navigates to the URL, waits for
    JavaScript to execute, and returns the fully rendered HTML.

    Args:
        url: The URL to fetch and render
        wait_for_selector: Optional CSS selector to wait for before returning HTML
        timeout: Maximum time to wait in milliseconds (default: 60000)

    Returns:
        The fully rendered HTML content after JavaScript execution

    Example:
        >>> html = await fetch_rendered_html('https://example.com')
        >>> html = await fetch_rendered_html('https://example.com', wait_for_selector='div.content')
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])

        try:
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await context.new_page()

            print(f'Navigating to {url}...')

            # Navigate with a more lenient wait condition for heavy JS sites
            await page.goto(url, wait_until='domcontentloaded', timeout=timeout)

            # Wait a bit for JS to execute
            await page.wait_for_timeout(2000)

            # Optionally wait for a specific element
            if wait_for_selector:
                await page.wait_for_selector(wait_for_selector, timeout=timeout)

            # Get the fully rendered HTML
            html_content = await page.content()

            print(f'Successfully fetched {len(html_content)} characters from {url}')

            await context.close()
            return html_content

        finally:
            await browser.close()
