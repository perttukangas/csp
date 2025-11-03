from enum import Enum

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
    selectors: dict[str, Selectors] = Field(..., description='Generated selectors for each requested field')
    raw_output: str | None = Field(None, description='Raw output from the AI model (for debugging)')

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


class ProcessRequest(BaseModel):
    """Request model for the main processing endpoint."""

    urls: list[ProcessUrlRequest] = Field(default_factory=list)
    htmls: list[HtmlContent] = Field(default_factory=list)
    prompt: str
    depth: int = Field(default=1, gt=0, description='How many link levels to follow. 1 means no crawling.')
