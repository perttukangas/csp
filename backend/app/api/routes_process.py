import asyncio

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.models.scrape import ProcessRequest, VerifyRequest
from app.services.scraping_service import generate_selectors_for_url, scrape_and_crawl
from app.services.validation_service import validate_and_refine_data

router = APIRouter(prefix='/api', tags=['process'])


@router.get('/healthz')
async def health_check():
    """Health check endpoint."""
    return 'ok'


@router.post('/verify')
async def verify_sample(request: VerifyRequest):
    """
    Verifies the prompt by processing only the first 3 URLs and returning CSV preview.
    This allows users to test their prompt before processing all URLs.
    """
    print(f'Starting verify_sample with {len(request.urls)} URLs')
    print(f'Request prompt: {request.prompt}')
    print(f'Validation Agent enabled: {request.use_validation_agent}')

    if not request.urls:
        raise HTTPException(status_code=400, detail='No URLs provided')

    # Limit to first 3 URLs for verification
    verification_urls = request.urls[:3]
    print(f'Processing first {len(verification_urls)} URLs for verification')

    async with httpx.AsyncClient(timeout=500.0) as client:
        url_to_selectors_map = {}

        if request.use_validation_agent:
            print('Phase 1: Starting SEQUENTIAL selector generation for verification.')
            for url_obj in verification_urls:
                selectors = await generate_selectors_for_url(client, url_obj.url, request.prompt)
                if selectors:
                    url_to_selectors_map[url_obj.url] = selectors
                print('Waiting for 65 seconds before next API call...')
                await asyncio.sleep(65)
        else:
            print('Phase 1: Starting CONCURRENT selector generation for verification.')
            selector_tasks = [generate_selectors_for_url(client, u.url, request.prompt) for u in verification_urls]
            selector_results = await asyncio.gather(*selector_tasks)
            url_to_selectors_map = {
                verification_urls[i].url: selectors for i, selectors in enumerate(selector_results) if selectors
            }

        if not url_to_selectors_map:
            raise HTTPException(status_code=500, detail='Failed to generate selectors for verification URLs.')

        print(f'Phase 2: Starting verification scraping for {len(url_to_selectors_map)} URLs')
        visited_urls: set[str] = set()
        scraping_tasks = [
            scrape_and_crawl(client, url, selectors, request.depth, visited_urls)
            for url, selectors in url_to_selectors_map.items()
        ]
        results = await asyncio.gather(*scraping_tasks)
        all_scraped_data = [item for sublist in results for item in sublist]
        print(f'Verification scraping complete. Total items scraped: {len(all_scraped_data)}')

        if request.use_validation_agent:
            print('Waiting for 65 seconds before validation agent call...')
            await asyncio.sleep(65)
            all_scraped_data = await validate_and_refine_data(client, all_scraped_data, url_to_selectors_map, request)

    print('Phase 3: Formatting verification data as CSV')
    if not all_scraped_data:
        return 'No data could be scraped from the verification URLs.'

    df = pd.DataFrame(all_scraped_data)
    csv_content = df.to_csv(index=False)

    print(f'Generated verification CSV with {len(df.index)} rows and {len(df.columns)} columns')

    # Return CSV as plain text for preview (not as file download)
    return Response(
        content=csv_content,
        media_type='text/plain',
        headers={'Content-Type': 'text/plain; charset=utf-8'},
    )


@router.post('/process')
async def process_urls(request: ProcessRequest):
    """
    Orchestrates the scraping process in two phases:
    1. Concurrently generates a unique set of selectors for each initial URL.
    2. Concurrently runs scraping/crawling tasks using the specific selectors for each URL.
    """
    print(f'Starting process_urls with {len(request.urls)} URLs, depth {request.depth}')
    print(f'Request prompt: {request.prompt}')
    print(f'Validation Agent enabled: {request.use_validation_agent}')

    if not request.urls:
        raise HTTPException(status_code=400, detail='No URLs provided')

    async with httpx.AsyncClient(timeout=500.0) as client:
        url_to_selectors_map = {}

        if request.use_validation_agent:
            print('Phase 1: Starting SEQUENTIAL selector generation.')
            for url_obj in request.urls:
                selectors = await generate_selectors_for_url(client, url_obj.url, request.prompt)
                if selectors:
                    url_to_selectors_map[url_obj.url] = selectors
                print('Waiting for 65 seconds before next API call...')
                await asyncio.sleep(65)
        else:
            print('Phase 1: Starting CONCURRENT selector generation.')
            selector_tasks = [generate_selectors_for_url(client, u.url, request.prompt) for u in request.urls]
            selector_results = await asyncio.gather(*selector_tasks)
            url_to_selectors_map = {
                request.urls[i].url: selectors for i, selectors in enumerate(selector_results) if selectors
            }

        if not url_to_selectors_map:
            raise HTTPException(status_code=500, detail='Failed to generate selectors for any URL.')

        print(f'Phase 2: Starting scraping for {len(url_to_selectors_map)} URLs')
        visited_urls: set[str] = set()
        scraping_tasks = [
            scrape_and_crawl(client, url, selectors, request.depth, visited_urls)
            for url, selectors in url_to_selectors_map.items()
        ]
        results = await asyncio.gather(*scraping_tasks)
        all_scraped_data = [item for sublist in results for item in sublist]
        print(f'Phase 2 complete. Total items scraped: {len(all_scraped_data)}')

        if request.use_validation_agent:
            print('Waiting for 65 seconds before validation agent call...')
            await asyncio.sleep(65)
            all_scraped_data = await validate_and_refine_data(client, all_scraped_data, url_to_selectors_map, request)

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
