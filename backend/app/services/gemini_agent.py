import json

from google import genai
from google.genai import types

from app.core.config import settings
from app.models.scrape import InputFormat, OutputFormat, ScrapeRequest, ScrapeResponse, Selectors

# ------------------------------------------------------------
# 🔹 Helper functions for prompt text
# ------------------------------------------------------------


def get_base_prompt() -> str:
    """Base instructions for Gemini – defines its role and task."""
    return """You are an expert web scraping AI agent that generates precise selectors from HTML/DOM content.

You will receive:
  - A URL (for context)
  - HTML content or a DOM tree
  - A natural language request describing what data to extract

Your tasks:
  1. Carefully analyze the HTML/DOM structure
  2. Identify the exact elements that match the user's request
  3. Convert field names to snake_case (e.g., 'Product Name' → 'product_name')
  4. Generate precise, stable, and unambiguous selectors
  5. Prefer selectors that are resilient to minor page changes (use semantic attributes when available)
"""


def get_format_instructions(fmt: OutputFormat) -> str:
    """Returns format-specific output instructions for the selector type."""
    if fmt == OutputFormat.XPATH:
        return """Output Format:
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

    if fmt == OutputFormat.CSS:
        return """Output Format:
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

    # BOTH
    return """Output Format:
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


# ------------------------------------------------------------
# 🔹 Main service class
# ------------------------------------------------------------


class GeminiAgentService:
    """Service that interacts with Gemini to generate web scraping selectors."""

    def __init__(self):
        if not settings.gemini_api_key:
            raise ValueError('GEMINI_API_KEY is not configured. Please set it in your .env file.')
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model_name = 'models/gemini-2.5-flash'

    # -----------------------------
    # Prompt construction
    # -----------------------------

    def _build_system_prompt(self, output_format: OutputFormat) -> types.Content:
        """Builds the system prompt describing Gemini’s role and expected output."""
        full_prompt = get_base_prompt() + get_format_instructions(output_format)
        return types.Content(parts=[types.Part(text=full_prompt)])

    def _build_user_prompt(self, request: ScrapeRequest) -> types.Content:
        """Builds the user prompt based on the given scrape request."""
        input_type = 'HTML content' if request.input_format == InputFormat.HTML else 'DOM tree'

        prompt = f"""URL: {request.url}

        Input Type: {input_type}

        Content:
        {request.content}

        User Request: {request.user_request}

        Generate the selectors now. Return ONLY the JSON output, no other text.
        """
        return types.Content(parts=[types.Part(text=prompt)])

    # -----------------------------
    # Response parsing
    # -----------------------------

    @staticmethod
    def _parse_gemini_response(response_text: str) -> dict:
        """Parses and validates the JSON response from Gemini."""
        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError as e:
            raise ValueError(f'Invalid JSON in Gemini response: {e}\nRaw output:\n{response_text}') from e
        if 'selectors' not in parsed:
            raise ValueError(f'Missing key "selectors" in response.\nRaw output:\n{response_text}')
        return parsed

    # -----------------------------
    # Main function: generation
    # -----------------------------

    def generate_selectors(self, request: ScrapeRequest) -> ScrapeResponse:
        """Calls Gemini and returns generated selectors."""
        system_prompt = self._build_system_prompt(request.output_format)
        user_prompt = self._build_user_prompt(request)

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[system_prompt, user_prompt],
                config=types.GenerateContentConfig(response_mime_type='application/json'),
            )
            raw_output = response.text
        except Exception as e:
            raise RuntimeError(f'Gemini API call failed: {e}') from e

        parsed = self._parse_gemini_response(raw_output)
        selectors = {
            name: Selectors(
                xpath=data.get('xpath'),
                css=data.get('css'),
            )
            for name, data in parsed['selectors'].items()
        }

        return ScrapeResponse(url=request.url, selectors=selectors, raw_output=raw_output)

    def validate_and_refine_selectors(self, validation_prompt: str) -> dict:
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[validation_prompt],
                config=types.GenerateContentConfig(response_mime_type='application/json'),
            )
            return json.loads(response.text)
        except (Exception, json.JSONDecodeError) as e:
            print(f'Validation agent call or JSON parsing failed: {e}')
            return {
                'decision': 'GOOD',
                'reasoning': 'Validation agent failed, skipping refinement.',
                'refined_selectors': {},
            }


# ------------------------------------------------------------
# 🔹 Singleton instance
# ------------------------------------------------------------

_gemini_service: GeminiAgentService | None = None


def get_gemini_service() -> GeminiAgentService:
    """Returns a singleton instance (only one Gemini service per app)."""
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiAgentService()
    return _gemini_service
