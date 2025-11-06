import json

from google import genai
from google.genai import types

from app.core.config import settings
from app.models.scrape import InputFormat, OutputFormat, ScrapeRequest, ScrapeResponse, Selectors, ProcessRequest

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
    - Use only XPath 1.0 syntax (no XPath 2.0+ functions like matches(), tokenize(), etc.)
    - Use absolute paths sparingly; prefer relative paths with meaningful attributes
    - Use text() for text content, @attribute for attributes
    - Prefer class names and IDs when stable
    - Use contains() for partial matches when appropriate
    - For case-insensitive matching, use translate() function to normalize case
    """


def get_analysis_instructions() -> str:
    """Returns instructions for analysis-only mode."""
    return """You are an expert web scraping AI agent that extracts structured data from HTML/DOM content.

    You will receive:
    - A URL (for context)
    - HTML content or a DOM tree
    - A natural language request describing what data to extract

    Your tasks:
    1. Analyze the HTML/DOM structure carefully.
    2. Identify all elements matching the user's request.
    3. Extract the data into a structured, tabular JSON array suitable for CSV conversion.

    Output Format:
    Return ONLY valid JSON in this format (no markdown, no explanations):
    [
    {
        "column_1": "value",
        "column_2": "value",
        ...
    },
    ...
    ]

    Rules:
    - Use snake_case for keys.
    - Ensure all records share the same set of keys.
    - Exclude empty or null entries.
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

    def _build_system_prompt(self, request: ScrapeRequest) -> types.Content:
        """Builds the system prompt describing Gemini’s role and expected output."""
        full_prompt = get_base_prompt() + get_format_instructions(request.output_format)

        if request.crawl:
            full_prompt += "\n\nCrawling Instructions:\n- When generating selectors, consider that the page may be crawled to additional depths. If so, ensure selectors remain valid for linked pages and generate an additional selector with the name 'next_page_selector'."

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

    def _build_validator_prompt(self, validation_fail_reasoning: str) -> types.Content:
        """Builds the prompt from the validation agent."""
        if not validation_fail_reasoning:
            return types.Content(parts=[types.Part(text='')])

        prompt = f"""The previous generation was not satisfactory.

Reasoning: {validation_fail_reasoning}
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
    def analyze_and_extract(self, request: ScrapeRequest) -> ScrapeResponse:
        """Calls Gemini to analyze the page and extract structured data directly."""
        system_prompt = types.Content(parts=[types.Part(text=get_analysis_instructions())])
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

        # Parse and validate output
        try:
            parsed_data = json.loads(raw_output)
            if not isinstance(parsed_data, list):
                raise ValueError('Gemini output must be a JSON list of records suitable for CSV conversion.')
        except json.JSONDecodeError as e:
            raise ValueError(f'Invalid JSON in Gemini response: {e}\nRaw output:\n{raw_output}') from e
        # Might be a good idea to make an analysis response model separately
        return ScrapeResponse(
            url=request.url,
            selectors=None,  # Not used in analysis mode
            raw_output=raw_output,
            extracted_data=parsed_data,  # new optional field for structured data
        )

    def generate_selectors(self, request: ScrapeRequest, validation_fail_reasoning: str) -> ScrapeResponse:
        """Calls Gemini and returns generated selectors."""
        system_prompt = self._build_system_prompt(request)
        user_prompt = self._build_user_prompt(request)
        validated_prompt = self._build_validator_prompt(validation_fail_reasoning)

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[system_prompt, user_prompt, validated_prompt],
                config=types.GenerateContentConfig(response_mime_type='application/json'),
            )
            raw_output = response.text
        except Exception as e:
            raise RuntimeError(f'Gemini API call failed: {e}') from e

        parsed = self._parse_gemini_response(raw_output)
        selectors = {name: Selectors(xpath=data.get('xpath')) for name, data in parsed['selectors'].items()}

        return ScrapeResponse(url=request.url, selectors=selectors, raw_output=raw_output, extracted_data=None)

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
            return {'decision': 'GOOD', 'reasoning': 'Validation agent failed, skipping refinement.'}


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
