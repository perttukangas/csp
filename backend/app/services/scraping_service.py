from typing import Any
from urllib.parse import urljoin

import httpx
from lxml import html
from lxml.html.clean import Cleaner

from app.models.scrape import OutputFormat, ScrapeRequest
from app.services.gemini_agent import get_gemini_service


async def scrape_and_crawl(
    client: httpx.AsyncClient,
    url: str,
    selectors: dict[str, Any],
    depth: int,
    visited: set[str],
) -> list[dict[str, str]]:
    """Recursively scrapes and crawls using a pre-generated set of selectors."""
    if url in visited or depth < 1:
        return []

    print(f'Scraping URL: {url} at depth {depth}')
    visited.add(url)

    try:
        html_content = await fetch_html(client, url)
        if not html_content:
            return []

        tree = html.fromstring(html_content)
        data_selectors = selectors.copy()
        next_page_selector_info = data_selectors.pop('next_page_selector', None)

        scraped_items = extract_items(tree, data_selectors, url)

        if depth > 1 and next_page_selector_info:
            next_items = await follow_next_page(client, url, tree, next_page_selector_info, selectors, depth, visited)
            scraped_items.extend(next_items)

        return scraped_items

    except Exception as e:
        print(f'An unexpected error occurred while scraping {url}: {e}')
        return []


async def fetch_html(client: httpx.AsyncClient, url: str) -> str | None:
    """Fetches HTML content for a given URL."""
    try:
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f'Failed to fetch {url}: {e}')
        return None


def extract_items(tree: html.HtmlElement, selectors: dict[str, Any], url: str) -> list[dict[str, str]]:
    """Extracts data items from a parsed HTML tree using given selectors."""
    if not selectors:
        return []

    first_field = next(iter(selectors))
    first_xpath = selectors[first_field].get('xpath')
    if not first_xpath:
        return []

    num_items = len(tree.xpath(first_xpath))
    items = []

    for i in range(num_items):
        item_data = {'source_url': url}
        for field, selector_info in selectors.items():
            xpath = selector_info.get('xpath')
            if not xpath:
                item_data[field] = ''
                continue

            elements = tree.xpath(f'({xpath})[{i + 1}]')
            if elements:
                el = elements[0]
                if hasattr(el, 'text_content'):
                    item_data[field] = el.text_content().strip()
                else:
                    item_data[field] = str(el).strip()
            else:
                item_data[field] = ''
        items.append(item_data)

    return items


async def follow_next_page(
    client: httpx.AsyncClient,
    url: str,
    tree: html.HtmlElement,
    next_page_selector_info: dict[str, Any],
    selectors: dict[str, Any],
    depth: int,
    visited: set[str],
) -> list[dict[str, str]]:
    """Finds and follows the next page link recursively."""
    next_xpath = next_page_selector_info.get('xpath')
    if not next_xpath:
        return []

    next_links = tree.xpath(f'({next_xpath})[1]/@href')
    if not next_links:
        return []

    next_url = urljoin(url, next_links[0])
    return await scrape_and_crawl(client, next_url, selectors, depth - 1, visited)


async def generate_selectors_for_url(client: httpx.AsyncClient, url: str, prompt: str) -> dict[str, Any]:
    """Fetches a URL's content and calls Gemini to generate selectors for it."""
    try:
        print(f'Generating selectors for: {url}')
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()

        truncated_html = truncate_html(response.text)

        gemini_service = get_gemini_service()
        scrape_req = ScrapeRequest(
            url=url,
            content=truncated_html,
            user_request=prompt,
            output_format=OutputFormat.XPATH,
        )

        selector_response = gemini_service.generate_selectors(scrape_req)
        result = {k: v.model_dump() for k, v in selector_response.selectors.items()}
        
        # LOG GENERATED SELECTORS
        print('Generated selectors:')
        for field, selector_info in result.items():
            print(f'  {field}: {selector_info.get("xpath", "N/A")}')
        
        return result
    except Exception as e:
        print(f'Failed to generate selectors for {url}: {e}')
        return {}


def truncate_html(html_content: str) -> str:
    """Truncates HTML to only relevant content for selector generation."""
    try:
        tree = html.fromstring(html_content)
        
        cleaner = Cleaner(
            scripts=True,
            javascript=True,
            comments=True,
            style=True,
            inline_style=True,
            embedded=True,
            meta=True,
            page_structure=False,
            processing_instructions=True,
            remove_tags=['noscript', 'iframe', 'svg'],
        )
        tree = cleaner.clean_html(tree)
        
        for el in tree.xpath('//*[not(normalize-space())]'):
            if el.tag not in ['br', 'hr', 'img']:
                el.getparent().remove(el)
        
        cleaned = html.tostring(tree, encoding='unicode')
        
        return cleaned
    except Exception as e:
        print(f'HTML truncation failed: {e}')
        # Fallback to simple truncation
        return html_content[:max_length] if len(html_content) > max_length else html_content