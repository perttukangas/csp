from typing import Any, Dict
from urllib.parse import urljoin

import httpx
from lxml import html

from app.models.scrape import ScrapeRequest
from app.services.gemini_agent import get_gemini_service


async def scrape_and_crawl(
    client: httpx.AsyncClient, 
    url: str, 
    selectors: Dict[str, Any], 
    depth: int, 
    visited: set[str]
) -> list[dict[str, str]]:
    """
    Recursively scrapes and crawls using a pre-generated set of selectors for a specific crawl path.
    """
    if url in visited or depth < 1:
        return []
    
    print(f"Scraping URL: {url} at depth {depth}")
    visited.add(url)
    
    try:
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()
        html_content = response.text
        tree = html.fromstring(html_content)

        data_selectors = selectors.copy()
        next_page_selector_info = data_selectors.pop('next_page_selector', None)
        
        scraped_items = []
        if data_selectors:
            first_field = next(iter(data_selectors))
            first_selector_xpath = data_selectors[first_field].get('xpath')
            if first_selector_xpath:
                num_items = len(tree.xpath(first_selector_xpath))
                if num_items > 0:
                    for i in range(num_items):
                        item_data = {"source_url": url} # Add the source URL to each item
                        for field, selector_info in data_selectors.items():
                            xpath = selector_info.get('xpath')
                            if xpath:
                                elements = tree.xpath(f"({xpath})[{i+1}]")
                                if elements:
                                    element = elements[0]
                                    # Handle both element nodes and text results
                                    if hasattr(element, 'text_content'):
                                        item_data[field] = element.text_content().strip()
                                    else:
                                        # This is likely a text node or attribute value
                                        item_data[field] = str(element).strip()
                                else:
                                    item_data[field] = ""
                        scraped_items.append(item_data)

        if depth > 1 and next_page_selector_info:
            next_page_xpath = next_page_selector_info.get('xpath')
            if next_page_xpath:
                next_link_elements = tree.xpath(f"({next_page_xpath})[1]/@href")
                if next_link_elements:
                    next_link = next_link_elements[0]
                    next_url = urljoin(url, next_link)
                    nested_results = await scrape_and_crawl(client, next_url, selectors, depth - 1, visited)
                    scraped_items.extend(nested_results)

        return scraped_items

    except Exception as e:
        print(f"An unexpected error occurred while scraping {url}: {e}")
        return []


async def generate_selectors_for_url(client: httpx.AsyncClient, url: str, prompt: str) -> Dict[str, Any]:
    """Fetches a URL's content and calls Gemini to generate selectors for it."""
    try:
        print(f"Generating selectors for: {url}")
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()
        
        gemini_service = get_gemini_service()
        scrape_req = ScrapeRequest(
            url=url,
            content=response.text,
            user_request=prompt,
            output_format="xpath"
        )
        selector_response = gemini_service.generate_selectors(scrape_req)
        return {k: v.model_dump() for k, v in selector_response.selectors.items()}
    except Exception as e:
        print(f"Failed to generate selectors for {url}: {e}")
        return {} # Return empty dict on failure