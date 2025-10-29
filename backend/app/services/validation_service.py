import asyncio

import httpx
import pandas as pd

from app.models.scrape import ProcessRequest
from app.services.gemini_agent import get_gemini_service
from app.services.scraping_service import scrape_and_crawl


async def validate_and_refine_data(
    client: httpx.AsyncClient, initial_data: list[dict], original_selectors_map: dict, request: ProcessRequest
) -> tuple[str, str]:
    if not initial_data:
        return 'BAD', 'No data scraped.'

    df = pd.DataFrame(initial_data)
    samples_by_url = {
        url: df[df['source_url'] == url].head(5).to_string()
        for url in original_selectors_map.keys()
        if not df[df['source_url'] == url].empty
    }

    validation_prompt = f"""
You are an expert Data Validation and Scraping Correction Agent.
Your task is to analyze scraped data and decide if it's completely unusable or acceptable.

Analyze the following information:
1.  **Original User Request:** "{request.prompt}"
2.  **Original Selectors:** {original_selectors_map}
3.  **Data Samples Produced by Selectors:**
    {samples_by_url}

**Your Tasks:**
1.  **Decide:** Is the data completely bad (gibberish/nonsense) or acceptable?
    - Only mark as BAD if the data is entirely gibberish, completely unrelated to the request, or pure nonsense.
    - Data is GOOD if it contains any relevant information related to the user's request, even if imperfect.
    - Minor issues like some missing values, slight formatting inconsistencies, or extra fields are acceptable.
2.  **Act:**
    - If the data is BAD (completely unusable), provide reasoning.
    - If the data is GOOD (contains any useful information), confirm it's acceptable.

**Output Format:**
Return ONLY a valid JSON object with this exact structure:
{{
  "decision": "GOOD" or "BAD",
  "reasoning": "A brief explanation of your decision."
}}
"""

    gemini_service = get_gemini_service()
    parsed_response = gemini_service.validate_and_refine_selectors(validation_prompt)

    decision = parsed_response.get('decision', 'GOOD')
    reasoning = parsed_response.get('reasoning', 'No reasoning provided.')

    print(f'Validation Agent Decision: {decision}. Reason: {reasoning}')

    return decision, reasoning
