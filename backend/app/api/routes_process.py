import asyncio

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.models.scrape import ProcessRequest
from app.services.scraping_service import (
    generate_selectors_for_url,
    scrape_and_crawl,
    generate_selectors_and_scrape_data,
)
from app.services.validation_service import validate_and_refine_data

router = APIRouter(prefix='/api', tags=['process'])


@router.get('/healthz')
async def health_check():
    """Health check endpoint."""
    return 'ok'


@router.post('/process')
async def process_urls(request: ProcessRequest):
    """
    Orchestrates the scraping process in two phases:
    1. Concurrently generates a unique set of selectors for each initial URL.
    2. Concurrently runs scraping/crawling tasks using the specific selectors for each URL.
    """
    print(f'Starting process_urls with {len(request.urls)} URLs, depth {request.depth}')
    if request.htmls:
        print(f'Starting processing of {len(request.htmls)} HTML content with prompt: {request.prompt}')
    print(f'Request prompt: {request.prompt}')

    if not request.urls and not request.htmls:
        raise HTTPException(status_code=400, detail='No URLs or HTML content provided')

    async with httpx.AsyncClient(timeout=500.0) as client:
        all_scraped_data, url_to_selectors_map = await generate_selectors_and_scrape_data(client, request, None)

        decision, reasoning = await validate_and_refine_data(client, all_scraped_data, url_to_selectors_map, request)

        if decision == 'BAD':
            all_scraped_data, url_to_selectors_map = await generate_selectors_and_scrape_data(
                client, request, reasoning
            )

    print('Phase 3: Formatting data as CSV')
    if not all_scraped_data:
        return 'No data could be scraped from the provided URLs.'

    df = pd.DataFrame(all_scraped_data)
    csv_content = df.to_csv(index=False)

    print(f'Generated CSV with {len(df.index)} rows and {len(df.columns)} columns')
    print("-- CSV Conetent Start --")
    print(csv_content)
    print("-- CSV Content End --")

    return Response(
        content=csv_content,
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename=scraping_results.csv'},
    )
