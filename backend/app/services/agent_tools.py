from playwright.sync_api import sync_playwright
from lxml import html

def fetch_with_selectors(url: str, selectors: dict[str, str]) -> dict[str, list]:
    """
    Fetches content from a URL and extracts data using a given set of XPath selectors.
    
    selectors: dict[str, str]
        {"titles": "//h2/text()", "links": "//a/@href"}

    Returns:
        dict[str, list]
        {"titles": ["Title 1", "Title 2"], "links": ["/link1", "/link2"]}
    """
    print(f"Validating selectors for {url}...")
    print(f"Selectors: {selectors}")
    
    if not selectors:
        return {"error": "No selectors provided for validation."}

    try:
        # Use the synchronous API
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            try:
                page.goto(url, timeout=15000)
            except Exception as e:
                browser.close()
                return {"error": f"Failed to navigate to URL: {str(e)}"}
                
            content = page.content()
            browser.close()

        tree = html.fromstring(content)
        extracted = {}
        for key, xpath in selectors.items():
            try:
                extracted[key] = tree.xpath(xpath)
            except Exception as e:
                extracted[key] = [f"XPath Error: {str(e)}"]
                
        print(f"Extracted data: {extracted}")
        return extracted
    except Exception as e:
        print(f"Playwright or lxml error: {e}")
        return {"error": f"An unexpected error occurred during extraction: {str(e)}"}