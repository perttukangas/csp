import asyncio

import httpx
import pandas as pd

from app.models.scrape import ProcessRequest
from app.services.gemini_agent import get_gemini_service
from app.services.scraping_service import scrape_and_crawl


async def validate_and_refine_data(
    client: httpx.AsyncClient, initial_data: list[dict], original_selectors_map: dict, request: ProcessRequest
) -> list[dict]:
    if not initial_data:
        return initial_data

    df = pd.DataFrame(initial_data)
    samples_by_url = {
        url: df[df['source_url'] == url].head(5).to_string()
        for url in original_selectors_map.keys()
        if not df[df['source_url'] == url].empty
    }

    validation_prompt = f"""
You are an expert Data Validation and Scraping Correction Agent.
Your task is to analyze scraped data and decide if it's valid. If not, you must provide corrected selectors.

Analyze the following information:
1.  **Original User Request:** "{request.prompt}"
2.  **Original Selectors:** {original_selectors_map}
3.  **Data Samples Produced by Selectors:**
    {samples_by_url}

**Your Tasks:**
1.  **Decide:** Is the data good or bad?
    - Check for irrelevant fields not mentioned in the request.
    - Ensure data is clean and correctly formatted (e.g., price should be a number, not 'Price: 24.99 EUR').
    - Verify that all requested data points are present and not null/empty.
    - Confirm that the data type and content match the request (e.g., URLs for images, not color names).
    - Ensure related data is properly grouped on a single row, not split across multiple rows.
    - Unify inconsistent column names (e.g., 'image_url' and 'picture_source' should be the same).
2.  **Act:**
    - If the data is BAD, provide a JSON object with corrected selectors for ALL URLs.
    - If the data is GOOD, provide an empty JSON object for the selectors.

**Output Format:**
Return ONLY a valid JSON object with this exact structure:
{{
  "decision": "GOOD" or "BAD",
  "reasoning": "A brief explanation of your decision.",
  "refined_selectors": {{
    "https://url-A.com": {{ "field_name": {{"xpath": "..."}} }},
    "https://url-B.com": {{ "field_name": {{"xpath": "..."}} }}
  }}
}}
"""

    gemini_service = get_gemini_service()
    parsed_response = gemini_service.validate_and_refine_selectors(validation_prompt)

    decision = parsed_response.get('decision', 'BAD')
    reasoning = parsed_response.get('reasoning', 'No reasoning provided.')
    refined_selectors = parsed_response.get('refined_selectors', {})

    print(f'Validation Agent Decision: {decision}. Reason: {reasoning}')

    if decision == 'GOOD' or not refined_selectors:
        print('Data is valid or no corrections were provided.')
        return initial_data

    print('Re-scraping data with refined selectors from validation agent...')
    visited_urls: set[str] = set()
    rescraping_tasks = [
        scrape_and_crawl(client, url, selectors, request.depth, visited_urls)
        for url, selectors in refined_selectors.items()
        if selectors
    ]

    new_results = await asyncio.gather(*rescraping_tasks)
    return [item for sublist in new_results for item in sublist]
