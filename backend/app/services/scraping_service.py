from typing import Any
from urllib.parse import urljoin

import httpx
from lxml import html
from lxml.html.clean import Cleaner
from typing import Tuple
from fastapi import HTTPException
import asyncio


from app.models.scrape import ProcessRequest
from app.models.scrape import OutputFormat, ScrapeRequest
from app.services.gemini_agent import get_gemini_service
from app.services.html_renderer import fetch_rendered_html


async def scrape_and_crawl_html(
    client: httpx.AsyncClient,
    html_content: str,
    url: str,
    selectors: dict[str, Any],
    depth: int,
    visited: set[str],
):
    tree = html.fromstring(html_content)
    data_selectors = selectors.copy()
    next_page_selector_info = data_selectors.pop('next_page_selector', None)

    scraped_items = extract_items(tree, data_selectors, url)

    if depth > 1 and next_page_selector_info:
        next_items = await follow_next_page(client, url, tree, next_page_selector_info, selectors, depth, visited)
        scraped_items.extend(next_items)

    return scraped_items


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

    html_content = await fetch_html(client, url)
    if not html_content:
        return []

    result = await scrape_and_crawl_html(client, html_content, url, selectors, depth, visited)
    return result


async def fetch_html(client: httpx.AsyncClient, url: str, use_playwright: bool = True) -> str | None:
    """
    Fetches HTML content for a given URL.
    
    Args:
        client: The httpx client (used when use_playwright=False)
        url: The URL to fetch
        use_playwright: If True, uses Playwright to render JavaScript-heavy pages
    
    Returns:
        The HTML content or None if fetching fails
    """
    try:
        if use_playwright:
            print(f'Fetching {url} with Playwright (JavaScript rendering enabled)')
            html_content = await fetch_rendered_html(url)
            return html_content
        else:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            return response.text
    except Exception as e:
        print(f'Failed to fetch {url}: {e}')
        return None


def extract_items(tree: html.HtmlElement, selectors: dict[str, Any], url: str) -> list[dict[str, str]]:
    if not selectors:
        return []

    num_items = 0
    for field, selector_info in selectors.items():
        xpath = selector_info.get('xpath') if isinstance(selector_info, dict) else selector_info

        if xpath and not any(func in xpath for func in ['concat', 'count', 'sum', 'boolean', 'normalize-space']):
            try:
                result = tree.xpath(xpath)
                if isinstance(result, list):
                    num_items = len(result)
                    break
            except Exception:
                continue

    if num_items == 0 and selectors:
        num_items = 1

    items = []
    for i in range(num_items):
        item_data = {'source_url': url}
        for field, selector_info in selectors.items():
            xpath = selector_info.get('xpath') if isinstance(selector_info, dict) else selector_info

            if not xpath:
                item_data[field] = ''
                continue

            try:
                result = tree.xpath(xpath)

                if isinstance(result, list):
                    if i < len(result):
                        element = result[i]
                        if hasattr(element, 'text_content'):
                            item_data[field] = element.text_content().strip()
                        else:
                            item_data[field] = str(element).strip()
                    else:
                        item_data[field] = ''
                else:
                    item_data[field] = str(result).strip()

            except Exception as e:
                print(f'Error on field "{field}" with xpath "{xpath}": {e}')
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


async def generate_selectors_html(
    html_content: str, url: str, prompt: str, validation_fail_reasoning: str, crawl: bool
) -> dict[str, Any]:
    try:
        original_length = len(html_content)
        truncated_html = truncate_html(html_content)
        truncated_length = len(truncated_html)
        print(
            f'HTML truncation: {original_length} -> {truncated_length} chars ({truncated_length / original_length * 100:.1f}%)'
        )

        gemini_service = get_gemini_service()
        scrape_req = ScrapeRequest(
            url=url,
            content=truncated_html,
            user_request=prompt,
            output_format=OutputFormat.XPATH,
            crawl=crawl,
        )

        selector_response = gemini_service.generate_selectors(scrape_req, validation_fail_reasoning)

        if selector_response.selectors is None:
            print(f'No selectors generated for {url}')
            return {}

        result = {k: v.model_dump() for k, v in selector_response.selectors.items()}

        # LOG GENERATED SELECTORS
        print('Generated selectors:')
        for field, selector_info in result.items():
            print(f'  {field}: {selector_info.get("xpath", "N/A")}')

        return result
    except Exception as e:
        print(f'Failed to generate selectors for {url}: {e}')
        return {}
    pass


async def generate_selectors_for_url(
    client: httpx.AsyncClient, url: str, prompt: str, validation_fail_reasoning: str, crawl: bool
) -> dict[str, Any]:
    """Fetches a URL's content and calls Gemini to generate selectors for it."""
    try:
        print(f'Generating selectors for: {url}')
        html = await fetch_html(client, url, use_playwright=True)
        print(f'Fetched {len(html) if html else 0} characters from {url} for selector generation.')
        result = await generate_selectors_html(html, url, prompt, validation_fail_reasoning, crawl)

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
        # Fallback to original content
        return html_content


async def generate_selectors_and_scrape_data(
    client: httpx.AsyncClient, request: ProcessRequest, validation_fail_reasoning: str | None
) -> Tuple[list[dict[str, Any]], dict[str, Any]]:
    print('Phase 1: Starting CONCURRENT selector generation.')
    reasoning = validation_fail_reasoning or ''
    selector_tasks = [
        generate_selectors_for_url(client, u.url, request.prompt, reasoning, request.crawl) for u in request.urls
    ]
    selector_tasks_html = [
        generate_selectors_html(h.html, f'html_content_{i}', request.prompt, reasoning, request.crawl)
        for i, h in enumerate(request.htmls)
    ]

    selector_results = await asyncio.gather(*selector_tasks)
    html_selector_results = await asyncio.gather(*selector_tasks_html)

    print('html selectors ', html_selector_results)

    url_to_selectors_map = {request.urls[i].url: selectors for i, selectors in enumerate(selector_results) if selectors}
    html_to_selectors_map = {
        f'html_content_{i}': selectors for i, selectors in enumerate(html_selector_results) if selectors
    }
    if not url_to_selectors_map and not html_to_selectors_map:
        raise HTTPException(status_code=500, detail='Failed to generate selectors for any URL.')

    print(
        f'Phase 2: Starting scraping for {len(url_to_selectors_map)} URLs and {len(html_to_selectors_map)} HTML contents'
    )
    visited_urls: set[str] = set()
    scraping_tasks = [
        scrape_and_crawl(client, url, selectors, request.depth, visited_urls)
        for url, selectors in url_to_selectors_map.items()
    ]

    # Add HTML content scraping tasks with the actual HTML content
    for i, (html_id, selectors) in enumerate(html_to_selectors_map.items()):
        html_content = request.htmls[i].html
        scraping_tasks.append(
            scrape_and_crawl_html(client, html_content, html_id, selectors, request.depth, visited_urls)
        )

    results = await asyncio.gather(*scraping_tasks)
    all_scraped_data = [item for sublist in results for item in sublist]
    print(f'Phase 2 complete. Total items scraped: {len(all_scraped_data)}')

    # Combine both maps for return
    combined_selectors_map = {**url_to_selectors_map, **html_to_selectors_map}
    return all_scraped_data, combined_selectors_map


async def analyse_and_extract_for_url(client: httpx.AsyncClient, url: str, prompt: str) -> list[dict[str, Any]]:
    """Fetches a URL's content and calls Gemini to analyse and extract data from it."""
    try:
        print(f'Analysing and extracting data for: {url}')
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()

        truncated_html = truncate_html(response.text)

        gemini_service = get_gemini_service()
        scrape_req = ScrapeRequest(
            url=url,
            content=truncated_html,
            user_request=prompt,
            output_format=OutputFormat.XPATH,
            crawl=False,
        )

        analysis_response = gemini_service.analyze_and_extract(scrape_req)

        scraped_items = analysis_response.extracted_data

        if scraped_items is None:
            print(f'No data extracted for {url}')
            return []

        print(f'Extraction complete. Items extracted: {len(scraped_items)}')
        return scraped_items
    except Exception as e:
        print(f'Failed to analyse and extract for {url}: {e}')
        return []


async def analyse_and_extract(client: httpx.AsyncClient, request: ProcessRequest) -> list[dict[str, Any]]:
    """Fetches a URL's content and calls Gemini to analyse and extract data from it."""
    print('Analysis only mode: Starting scraping without selector generation or crawling.')
    analysis_tasks = [analyse_and_extract_for_url(client, u.url, request.prompt) for u in request.urls]
    results = await asyncio.gather(*analysis_tasks)
    all_scraped_data = [item for sublist in results for item in sublist]
    print(f'Analysis only scraping complete. Total items scraped: {len(all_scraped_data)}')

    return all_scraped_data
