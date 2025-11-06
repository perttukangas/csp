import asyncio

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.models.scrape import ProcessRequest
from app.services.scraping_service import (
    analyse_and_extract,
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
    print(f'Starting process_urls with {len(request.urls)} URLs, depth {request.depth}, crawling {request.crawl}')
    print(f'Check for analysis mode override: {request.analysis_only}')
    print(f'Request prompt: {request.prompt}')

    if not request.urls:
        raise HTTPException(status_code=400, detail='No URLs provided')

    async with httpx.AsyncClient(timeout=500.0) as client:
        if not request.analysis_only:
            all_scraped_data, url_to_selectors_map = await generate_selectors_and_scrape_data(client, request, None)

            decision, reasoning = await validate_and_refine_data(client, all_scraped_data, url_to_selectors_map, request)

            if decision == 'BAD':
                all_scraped_data, url_to_selectors_map = await generate_selectors_and_scrape_data(
                    client, request, reasoning
                )
        else:
            print('Analysis only mode: Skipping selector generation and crawling.')
            all_scraped_data = await analyse_and_extract(client, request)

    print('Phase 3: Formatting data as CSV')
    if not all_scraped_data:
        return 'No data could be scraped from the provided URLs.'

    df = pd.DataFrame(all_scraped_data)
    csv_content = df.to_csv(index=False)

    print(f'Generated CSV with {len(df.index)} rows and {len(df.columns)} columns')

    return Response(
        content=csv_content,
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename=scraping_results.csv'},
    )
