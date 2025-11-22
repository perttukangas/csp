import selectors
from playwright.sync_api import sync_playwright
from lxml import html

from app.models.scrape import (
    InputFormat,
    OutputFormat,
    ScrapeRequest,
    ScrapeResponse,
    ProcessRequest,
    ModelResponse,
    FieldSelectors,
)


def fetch_with_selectors(url: str, selectors: dict[str, str]) -> dict[str, list[str] | str]:
    """
    Fetches content from a URL and extracts data using a given set of XPath selectors.

    selectors: dict[str, str]
        {"titles": "//h2/text()", "links": "//a/@href"}

    Returns:
        dict[str, list]
        {"titles": ["Title 1", "Title 2"], "links": ["/link1", "/link2"]}
    """
    print(f'Validating selectors for {url}...')
    print(f'Selectors: {selectors}')

    if not selectors:
        return {'error': ['No selectors provided for validation.']}

    try:
        # Use the synchronous API
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            try:
                page.goto(url, timeout=15000)
            except Exception as e:
                browser.close()
                return {'error': [f'Failed to navigate to URL: {str(e)}']}

            content = page.content()
            browser.close()

        tree = html.fromstring(content)
        extracted: dict[str, list[str] | str] = {}

        for key, xpath in selectors.items():
            try:
                raw_results = tree.xpath(xpath)
                cleaned_results: list[str] = []

                # 🔹 FIX: Convert lxml objects to strings
                if not isinstance(raw_results, list):
                    raw_results = [raw_results] if raw_results else []  # type: ignore[list-item]

                for item in raw_results:
                    if isinstance(item, (bool, int, float)):
                        cleaned_results.append(str(item))
                    elif hasattr(item, 'text_content'):
                        # It's an Element (e.g., matched //h1 instead of //h1/text())
                        # Extract text content so it's readable in JSON
                        cleaned_results.append(item.text_content().strip())  # type: ignore[union-attr]
                    else:
                        # It's already a string (e.g., matched //h1/text() or //a/@href)
                        cleaned_results.append(str(item).strip())

                extracted[key] = cleaned_results
            except Exception as e:
                extracted[key] = [f'XPath Error: {str(e)}']

        print(f'Extracted data: {extracted}')
        return extracted
    except Exception as e:
        print(f'Playwright or lxml error: {e}')
        return {'error': [f'An unexpected error occurred during extraction: {str(e)}']}
