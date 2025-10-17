import json

import google.generativeai as genai

from app.core.config import settings
from app.models.scrape import InputFormat, OutputFormat, ScrapeRequest, ScrapeResponse, Selectors


class GeminiAgentService:
    """Service for interacting with Gemini AI to generate web scraping selectors"""

    def __init__(self):
        """Initialize the Gemini agent with API key from settings"""
        if not settings.gemini_api_key:
            raise ValueError('GEMINI_API_KEY is not configured. Please set it in your .env file.')

        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')

    def _build_system_prompt(self, output_format: OutputFormat) -> str:
        """Build the system prompt based on desired output format"""

        base_prompt = """You are an expert web scraping AI agent that generates precise selectors from HTML/DOM content.

You will receive:
  - A URL (for context)
  - HTML content or a DOM tree
  - A natural language request describing what data to extract

Your tasks:
  1. Carefully analyze the HTML/DOM structure
  2. Identify the exact elements that match the user's request
  3. Convert field names to snake_case (e.g., "Product Name" → "product_name")
  4. Generate precise, stable, and unambiguous selectors
  5. Prefer selectors that are resilient to minor page changes (use semantic attributes when available)
"""

        if output_format == OutputFormat.XPATH:
            format_instructions = """
Output Format:
Return ONLY valid JSON in this exact schema (no markdown, no explanations):
{
  "selectors": {
    "<field_name>": {
      "xpath": "<xpath_selector>"
    }
  }
}

XPath Guidelines:
- Use absolute paths sparingly; prefer relative paths with meaningful attributes
- Use text() for text content, @attribute for attributes
- Prefer class names and IDs when stable
- Use contains() for partial matches when appropriate
"""
        elif output_format == OutputFormat.CSS:
            format_instructions = """
Output Format:
Return ONLY valid JSON in this exact schema (no markdown, no explanations):
{
  "selectors": {
    "<field_name>": {
      "css": "<css_selector>"
    }
  }
}

CSS Guidelines:
- Use class names and IDs when available and stable
- Use attribute selectors for semantic attributes
- Prefer direct child (>) over descendant when structure is stable
- Use :nth-child() or :nth-of-type() only when necessary
"""
        else:  # BOTH
            format_instructions = """
Output Format:
Return ONLY valid JSON in this exact schema (no markdown, no explanations):
{
  "selectors": {
    "<field_name>": {
      "xpath": "<xpath_selector>",
      "css": "<css_selector>"
    }
  }
}

Selector Guidelines:
- Generate both XPath and CSS selectors for each field
- XPath: Use text() for text content, @attribute for attributes
- CSS: Use class names, IDs, and attribute selectors
- Both should target the same element
- Prefer stable, semantic selectors over brittle positional ones
"""

        return base_prompt + format_instructions

    def _build_user_prompt(self, request: ScrapeRequest) -> str:
        """Build the user prompt with the actual request data"""

        input_type = 'HTML content' if request.input_format == InputFormat.HTML else 'DOM tree'

        prompt = f"""URL: {request.url}

Input Type: {input_type}

Content:
{request.content}

User Request: {request.user_request}

Generate the selectors now. Return ONLY the JSON output, no other text."""

        return prompt

    def _parse_gemini_response(self, response_text: str, output_format: OutputFormat) -> dict:
        """Parse and validate the Gemini response"""

        # Remove markdown code blocks if present
        cleaned_text = response_text.strip()
        if cleaned_text.startswith('```json'):
            cleaned_text = cleaned_text[7:]
        elif cleaned_text.startswith('```'):
            cleaned_text = cleaned_text[3:]

        if cleaned_text.endswith('```'):
            cleaned_text = cleaned_text[:-3]

        cleaned_text = cleaned_text.strip()

        # Parse JSON
        try:
            parsed = json.loads(cleaned_text)
        except json.JSONDecodeError as e:
            raise ValueError(f'Failed to parse JSON response: {e}. Raw output: {response_text}')

        # Validate structure
        if 'selectors' not in parsed:
            raise ValueError(f'Response missing "selectors" key. Raw output: {response_text}')

        return parsed

    def generate_selectors(self, request: ScrapeRequest) -> ScrapeResponse:
        """
        Generate selectors using Gemini AI

        Args:
            request: ScrapeRequest containing URL, content, and user request

        Returns:
            ScrapeResponse with generated selectors

        Raises:
            ValueError: If API key is not configured or response is invalid
            Exception: If Gemini API call fails
        """

        # Build prompts
        system_prompt = self._build_system_prompt(request.output_format)
        user_prompt = self._build_user_prompt(request)

        # Call Gemini API
        try:
            response = self.model.generate_content([system_prompt, user_prompt])
            raw_output = response.text
        except Exception as e:
            raise Exception(f'Gemini API call failed: {str(e)}')

        # Parse response
        try:
            parsed_data = self._parse_gemini_response(raw_output, request.output_format)
        except ValueError as e:
            # Return error with raw output for debugging
            raise ValueError(str(e))

        # Convert to Selectors objects
        selectors_dict = {}
        for field_name, selector_data in parsed_data['selectors'].items():
            selectors_dict[field_name] = Selectors(xpath=selector_data.get('xpath'), css=selector_data.get('css'))

        return ScrapeResponse(url=request.url, selectors=selectors_dict, raw_output=raw_output)


# Singleton instance
_gemini_service: GeminiAgentService | None = None


def get_gemini_service() -> GeminiAgentService:
    """Get or create the Gemini agent service singleton"""
    global _gemini_service

    if _gemini_service is None:
        _gemini_service = GeminiAgentService()

    return _gemini_service
