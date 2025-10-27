from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class InputFormat(str, Enum):
    """Format of the input content"""

    HTML = 'html'
    DOM = 'dom'


class OutputFormat(str, Enum):
    """Format of the output selectors"""

    XPATH = 'xpath'


class ScrapeRequest(BaseModel):
    """Request model for scraping agent"""

    url: str = Field(..., description='The URL of the page to scrape')
    content: str = Field(..., description='The HTML content or DOM tree of the page')
    input_format: InputFormat = Field(default=InputFormat.HTML, description='Format of the input content (html or dom)')
    user_request: str = Field(..., description='Natural language description of what data to extract')
    output_format: OutputFormat = Field(default=OutputFormat.XPATH, description='Desired output format for selectors')
    crawl: bool = Field(default=False, description='Whether to enable crawling for the URLs.')

    class Config:
        json_schema_extra = {
            'example': {
                'url': 'https://example.com/products',
                'content': (
                    '<html><body><div class="product">'
                    '<h1>Product Name</h1>'
                    '<span class="price">$99.99</span>'
                    '</div></body></html>'
                ),
                'input_format': 'html',
                'user_request': 'Extract product name and price',
                'output_format': 'xpath',
            }
        }


class Selectors(BaseModel):
    """Selectors for a specific field"""

    xpath: str | None = Field(None, description='XPath selector for the field')


class ScrapeResponse(BaseModel):
    """Response model from scraping agent"""

    url: str = Field(..., description='The URL that was analyzed')
    selectors: dict[str, Selectors] | None = Field(None, description='Generated selectors for each requested field')
    raw_output: str | None = Field(None, description='Raw output from the AI model (for debugging)')
    extracted_data: list[dict[str, Any]] | None = Field(
        None, description='Extracted structured data (for analysis mode)'
    )

    class Config:
        json_schema_extra = {
            'example': {
                'url': 'https://example.com/products',
                'selectors': {
                    'product_name': {'xpath': '//h1[@class="product-title"]/text()'},
                    'price': {'xpath': '//span[@class="price"]/text()'},
                },
            }
        }


class ErrorResponse(BaseModel):
    """Error response model"""

    error: str = Field(..., description='Error message')
    details: str | None = Field(None, description='Additional error details')


class ProcessUrlRequest(BaseModel):
    """A single URL to be processed."""

    url: str

class HtmlContent(BaseModel):
    """HTML content to process."""

    html: str
    
class VerifyRequest(BaseModel):
    """Request model for the verification endpoint."""

    urls: list[ProcessUrlRequest] = Field(default_factory=list)
    htmls: list[HtmlContent] = Field(default_factory=list)
    prompt: str
    depth: int = Field(default=1, gt=0, description='How many link levels to follow. 1 means no crawling.')
    crawl: bool = Field(default=False, description='Whether to enable crawling for the URLs.')
    analysis_only: bool = Field(
        default=False, description='If true, analyze the page and extract data directly without crawling.'
    )
    use_validation_agent: bool | None = Field(
        default=False, description='Use a second agent to analyze and refine results.'
    )





class ProcessRequest(BaseModel):
    """Request model for the main processing endpoint."""

    urls: list[ProcessUrlRequest] = Field(default_factory=list)
    htmls: list[HtmlContent] = Field(default_factory=list)
    prompt: str
    depth: int = Field(default=10, gt=0, description='How many link levels to follow. 1 means no crawling.')
    crawl: bool = Field(default=False, description='Whether to enable crawling for the URLs.')
    analysis_only: bool = Field(
        default=False, description='If true, analyze the page and extract data directly without crawling.'
    )
