import asyncio
import csv
import io
from typing import Any, Dict
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from lxml import html

from app.models.scrape import ProcessRequest, ScrapeRequest
from app.services.gemini_agent import get_gemini_service

router = APIRouter(prefix='/api', tags=['process'])


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
                                item_data[field] = elements[0].text_content().strip() if elements else ""
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


@router.post("/process")
async def process_urls(request: ProcessRequest):
    """
    Orchestrates the scraping process in two phases:
    1. Concurrently generates a unique set of selectors for each initial URL.
    2. Concurrently runs scraping/crawling tasks using the specific selectors for each URL.
    """
    if not request.urls:
        raise HTTPException(status_code=400, detail="No URLs provided")

    async with httpx.AsyncClient(timeout=120.0) as client:
        # --- Phase 1: Generate Selectors for all initial URLs ---
        selector_generation_tasks = [
            generate_selectors_for_url(client, u.url, request.prompt) 
            for u in request.urls
        ]
        generated_selectors_list = await asyncio.gather(*selector_generation_tasks)
        
        # Create a mapping from each URL to its generated selectors
        url_to_selectors_map = {
            request.urls[i].url: selectors 
            for i, selectors in enumerate(generated_selectors_list) 
            if selectors # Only include URLs for which selectors were successfully generated
        }

        if not url_to_selectors_map:
            raise HTTPException(status_code=500, detail="Failed to generate selectors for any of the provided URLs.")

        # --- Phase 2: Scrape and Crawl using the generated selectors ---
        all_scraped_data = []
        visited_urls = set()
        
        scraping_tasks = [
            scrape_and_crawl(client, url, selectors, request.depth, visited_urls) 
            for url, selectors in url_to_selectors_map.items()
        ]
        results = await asyncio.gather(*scraping_tasks)
        for data in results:
            all_scraped_data.extend(data)

    # --- Phase 3: Format and Return CSV ---
    if not all_scraped_data:
        return "No data could be scraped from the provided URLs with the given prompt."

    output = io.StringIO()
    fieldnames = set(["source_url"]) # Ensure source_url is a field
    for item in all_scraped_data:
        fieldnames.update(item.keys())
    
    writer = csv.DictWriter(output, fieldnames=sorted(list(fieldnames)))
    writer.writeheader()
    writer.writerows(all_scraped_data)
    
    csv_content = output.getvalue()
    
    # Create a response that the browser will treat as a file download.
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=scraping_results.csv"
        }
    )