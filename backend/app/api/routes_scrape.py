from fastapi import APIRouter, HTTPException

from app.models.scrape import ErrorResponse, ScrapeRequest, ScrapeResponse
from app.services.gemini_agent import get_gemini_service

router = APIRouter(prefix='/scrape', tags=['scrape'])


@router.post('/generate-selectors', response_model=ScrapeResponse, responses={400: {'model': ErrorResponse}})
async def generate_selectors(request: ScrapeRequest):
    """
    Generate web scraping selectors using Gemini AI

    This endpoint takes a URL, HTML/DOM content, and a natural language request,
    then uses Gemini AI to generate precise XPath and/or CSS selectors for extracting
    the requested data.

    Args:
        request: ScrapeRequest containing:
            - url: The URL of the page
            - content: HTML or DOM tree content
            - input_format: Format of the content (html or dom)
            - user_request: Natural language description of data to extract
            - output_format: Desired selector format (xpath, css, or both)

    Returns:
        ScrapeResponse with generated selectors for each field

    Raises:
        HTTPException: 400 if API key is not configured or request is invalid
        HTTPException: 500 if Gemini API call fails
    """

    try:
        # Get the Gemini service
        gemini_service = get_gemini_service()

        # Generate selectors
        response = gemini_service.generate_selectors(request)

        return response

    except ValueError as e:
        # Configuration or validation errors
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        # Unexpected errors
        raise HTTPException(status_code=500, detail=f'Internal server error: {str(e)}')


@router.get('/health')
async def health_check():
    """
    Health check endpoint to verify the scraping agent is configured correctly

    Returns:
        Status information about the Gemini agent service
    """

    try:
        # Try to get the service (will fail if API key not configured)
        get_gemini_service()
        return {'status': 'healthy', 'message': 'Gemini agent is configured and ready'}

    except ValueError as e:
        return {'status': 'unhealthy', 'message': str(e)}

    except Exception as e:
        return {'status': 'error', 'message': f'Unexpected error: {str(e)}'}

