import asyncio

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.models.scrape import ProcessRequest, VerifyRequest
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


@router.post('/verify')
async def verify_sample(request: VerifyRequest):
    """
    Verifies the prompt by processing only the first 3 URLs/HTMLs and returning CSV preview.
    This allows users to test their prompt before processing all URLs.
    Uses the exact same logic as /process but limited to 3 items.
    """
    # Limit to first 3 URLs and HTMLs
    limited_urls = request.urls[:3] if request.urls else []
    limited_htmls = request.htmls[:3] if request.htmls else []
    
    print(f'Starting verify_sample with {len(limited_urls)} URLs and {len(limited_htmls)} HTMLs, depth {request.depth}, crawling {request.crawl}')
    print(f'Check for analysis mode override: {request.analysis_only}')
    if limited_htmls:
        print(f'Starting processing of {len(limited_htmls)} HTML content with prompt: {request.prompt}')
    print(f'Request prompt: {request.prompt}')

    if not limited_urls and not limited_htmls:
        raise HTTPException(status_code=400, detail='No URLs or HTML content provided')

    # Create a limited request with only first 3 items
    limited_request = VerifyRequest(
        urls=limited_urls,
        htmls=limited_htmls,
        prompt=request.prompt,
        depth=request.depth,
        use_validation_agent=request.use_validation_agent,
        crawl=request.crawl,
        analysis_only=request.analysis_only,
    )

    async with httpx.AsyncClient(timeout=500.0) as client:
        if not limited_request.analysis_only:
            all_scraped_data, url_to_selectors_map = await generate_selectors_and_scrape_data(client, limited_request, None)

            decision, reasoning = await validate_and_refine_data(
                client, all_scraped_data, url_to_selectors_map, limited_request
            )

            if decision == 'BAD':
                all_scraped_data, url_to_selectors_map = await generate_selectors_and_scrape_data(
                    client, limited_request, reasoning
                )
        else:
            print('Analysis only mode: Skipping selector generation and crawling.')
            all_scraped_data = await analyse_and_extract(client, limited_request)

    print('Phase 3: Formatting verification data as CSV')
    if not all_scraped_data:
        return 'No data could be scraped from the provided URLs/HTMLs.'

    df = pd.DataFrame(all_scraped_data)
    csv_content = df.to_csv(index=False)

    print(f'Generated verification CSV with {len(df.index)} rows and {len(df.columns)} columns')
    print('-- CSV Content Start --')
    print(csv_content)
    print('-- CSV Content End --')

    return Response(
        content=csv_content,
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename=verification_results.csv'},
    )


@router.post('/process')
async def process_urls(request: ProcessRequest):
    """
    Orchestrates the scraping process in two phases:
    1. Concurrently generates a unique set of selectors for each initial URL.
    2. Concurrently runs scraping/crawling tasks using the specific selectors for each URL.
    """
    print(f'Starting process_urls with {len(request.urls)} URLs, depth {request.depth}, crawling {request.crawl}')
    print(f'Check for analysis mode override: {request.analysis_only}')
    if request.htmls:
        print(f'Starting processing of {len(request.htmls)} HTML content with prompt: {request.prompt}')
    print(f'Request prompt: {request.prompt}')

    if not request.urls and not request.htmls:
        raise HTTPException(status_code=400, detail='No URLs or HTML content provided')

    async with httpx.AsyncClient(timeout=500.0) as client:
        if not request.analysis_only:
            all_scraped_data, url_to_selectors_map = await generate_selectors_and_scrape_data(client, request, None)

            decision, reasoning = await validate_and_refine_data(
                client, all_scraped_data, url_to_selectors_map, request
            )

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
    print('-- CSV Conetent Start --')
    print(csv_content)
    print('-- CSV Content End --')

    return Response(
        content=csv_content,
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename=scraping_results.csv'},
    )