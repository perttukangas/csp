import json

from google import genai
from google.genai import types
import time
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from google.api_core.exceptions import GoogleAPICallError, ResourceExhausted, DeadlineExceeded


from app.core.config import settings
from app.models.scrape import (
    InputFormat,
    OutputFormat,
    ScrapeRequest,
    ScrapeResponse,
    ProcessRequest,
    ModelResponse,
    FieldSelectors,
    FetchRequest,
)
from app.services.agent_tools import fetch_with_selectors
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
  1. Carefully analyze the HTML/DOM structure to generate draft selectors.
  2. **VALIDATE YOUR WORK**: You MUST use the `fetch_with_selectors` tool to test your draft selectors against the URL.
  3. **ANALYZE RESULTS**:
     - If the tool returns data that matches the user's request, you are done.
     - If the tool returns empty lists, errors, or incorrect data, you MUST refine your selectors and call `fetch_with_selectors` again.
  4. **SUBMIT FINAL ANSWER**: Once you have validated your selectors and they work correctly, you MUST call the `submit_final_selectors` tool with the final, working JSON.

Rules:
  - Convert field names to snake_case (e.g., 'Product Name' → 'product_name').
  - Use only XPath 1.0 syntax.
  - Do not return the final answer as text. Only use the `submit_final_selectors` tool.
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


def pydantic_to_google_schema(model: type[BaseModel]) -> dict:
    """Converts a Pydantic model to a Google GenAI Schema dict."""
    return model.model_json_schema()


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

        fetch_tool_decl = {
            'name': 'fetch_with_selectors',
            'description': 'Fetches a URL and runs XPath selectors to validate them. Returns the extracted data.',
            'parameters': {
                'type': 'OBJECT',
                'properties': {
                    'url': {'type': 'STRING', 'description': 'The URL to fetch.'},
                    'selectors': {
                        'type': 'OBJECT',
                        'description': 'Dictionary where keys are field names and values are XPath strings.',
                    },
                },
                'required': ['url', 'selectors'],
            },
        }

        # 2. Schema for the final submission tool (uses our Pydantic model)
        submit_tool_decl = {
            'name': 'submit_final_selectors',
            'description': 'Submits the final, validated selectors when the task is complete.',
            # 🔹 MISSING LAYER: Everything below must be inside 'parameters'
            'parameters': {
                'type': 'OBJECT',
                'properties': {
                    'selectors': {
                        'type': 'OBJECT',
                        'description': 'A dictionary mapping snake_case field names...',
                    }
                },
                'required': ['selectors'],
            },
        }

        # 3. Create the tools list
        self.tools = [types.Tool(function_declarations=[fetch_tool_decl, submit_tool_decl])]

        self.config = types.GenerateContentConfig(tools=self.tools)

    # -----------------------------
    # Prompt construction
    # -----------------------------

    def _build_system_prompt(self, request: ScrapeRequest) -> types.Content:
        full_prompt = get_base_prompt()
        if request.crawl:
            full_prompt += "\n\nCrawling Instructions:\n- When generating selectors, consider that the page may be crawled to additional depths. If so, ensure selectors remain valid for linked pages and generate an additional selector with the name 'next_page_selector'."
        return types.Content(
            parts=[types.Part(text=full_prompt)], role='user'
        )  # System prompt is just a 'user' role first turn

    def _build_user_prompt(self, request: ScrapeRequest) -> types.Content:
        """Builds the user prompt based on the given scrape request."""
        input_type = 'HTML content' if request.input_format == InputFormat.HTML else 'DOM tree'

        prompt = f"""URL: {request.url}

        Input Type: {input_type}

        Content:
        {request.content}

        User Request: {request.user_request}

        Generate the selectors now.
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
        system_prompt = types.Content(parts=[types.Part(text=get_analysis_instructions())], role='user')
        user_prompt = self._build_user_prompt(request)
        flexible_analysis_schema: dict[str, str | dict[str, str]] = {'type': 'ARRAY', 'items': {'type': 'OBJECT'}}
        api_retry = 3
        for _ in range(api_retry):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=[system_prompt, user_prompt],
                    generation_config=types.GenerationConfig(
                        response_mime_type='application/json',
                        response_schema=flexible_analysis_schema,  # type: ignore[arg-type]
                    ),
                )
                raw_output = response.text
            except (GoogleAPICallError, ResourceExhausted, DeadlineExceeded) as api_error:
                print(f'API call failed: {api_error}. Retrying after delay...')
                time.sleep(2)

        try:
            parsed_data = json.loads(raw_output)
            if not isinstance(parsed_data, list):
                raise ValueError('Gemini output must be a JSON list of records.')
        except json.JSONDecodeError as e:
            raise ValueError(f'Invalid JSON in Gemini response: {e}\nRaw output:\n{raw_output}') from e

        return ScrapeResponse(
            url=request.url,
            selectors=None,
            raw_output=raw_output,
            extracted_data=parsed_data,
        )

    def generate_selectors(
        self, request: ScrapeRequest, validation_fail_reasoning: str, max_validations: int = 5
    ) -> ScrapeResponse:
        """Calls Gemini and uses a tool-calling loop to validate selectors."""

        system_prompt = self._build_system_prompt(request)
        user_prompt = self._build_user_prompt(request)
        validated_prompt = self._build_validator_prompt(validation_fail_reasoning)

        history = [system_prompt, user_prompt, validated_prompt]

        for _ in range(max_validations):
            try:
                print('Calling Gemini model...')
                api_retry = 3
                for _ in range(api_retry):
                    try:
                        response = self.client.models.generate_content(
                            model=self.model_name, contents=history, config=self.config
                        )
                    except (GoogleAPICallError, ResourceExhausted, DeadlineExceeded) as api_error:
                        print(f'API call failed: {api_error}. Retrying after delay...')
                        time.sleep(2)

                print('Gemini model called.')
                print(f'Raw response: {response.text}')

                if (
                    not response.candidates[0].content.parts
                    or not response.candidates[0].content.parts[0].function_call
                ):
                    part_text = response.text
                    raise RuntimeError(f'Model returned text instead of calling a tool: {part_text}')

                part = response.candidates[0].content.parts[0]

                # 🔹 FIX: Access 'args' directly as a property, not via to_dict()
                print('Getting function call arguments...')
                function_args = part.function_call.args
                print(f'Function call arguments: {function_args}')
                print('Determining which function was called...')
                function_name = part.function_call.name
                print(f'Function called: {function_name}')

                if function_name == 'submit_final_selectors':
                    print('Gemini is submitting final selectors.')

                    model_response = ModelResponse.model_validate(function_args)

                    final_selectors = {
                        name: FieldSelectors(xpath=data.xpath) for name, data in model_response.selectors.items()
                    }

                    return ScrapeResponse(
                        url=request.url,
                        selectors=final_selectors,
                        raw_output=json.dumps(dict(function_args)),
                        extracted_data=None,
                    )

                elif function_name == 'fetch_with_selectors':
                    print('Gemini is validating selectors...')
                    args_dict: dict[str, str] = dict(function_args)

                    url_to_fetch: str = args_dict.get('url', request.url)
                    selectors_to_fetch: dict[str, str] = args_dict.get('selectors', {})  # type: ignore[assignment]

                    extracted_data = fetch_with_selectors(url_to_fetch, selectors_to_fetch)

                    # Append the model's request to history
                    history.append(response.candidates[0].content)

                    # 🔹 UPDATED: Append the function's result using the SDK helper
                    # This is much cleaner and removes the need for protobuf
                    history.append(
                        types.Content(
                            role='user',
                            parts=[
                                types.Part.from_function_response(
                                    name='fetch_with_selectors',
                                    response=extracted_data,  # Pass the Python dict directly
                                )
                            ],
                        )
                    )

                else:
                    raise RuntimeError(f'Model did not call a function. Raw output: {part.text}')

            except (Exception, ValidationError) as e:
                raise RuntimeError(f'Gemini API call or validation failed: {e}') from e

        raise RuntimeError(f'Failed to generate and validate selectors after {max_validations} attempts.')

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
